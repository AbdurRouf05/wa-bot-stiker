// commands/spotify.js — .spotify <judul/artis>: cari lagu di Spotify lalu kirim audionya
// Metadata: RapidAPI spotify23 · Audio: dicari di YouTube (youtubei.js) lalu diunduh via RapidAPI YTStream
import fs from "fs";
import { Innertube } from "youtubei.js";
import { tmp, run, cleanup } from "../utils.js";

export const aliases = ["sp", "play", "lagu", "song"];

const SPOTIFY_HOST = "spotify23.p.rapidapi.com";
const YTSTREAM_HOST = "ytstream-download-youtube-videos.p.rapidapi.com";
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

let yt = null;
async function getYt() {
  if (!yt) yt = await Innertube.create({ retrieve_player: false });
  return yt;
}

const rapid = (host) => ({ "x-rapidapi-key": process.env.RAPIDAPI_KEY, "x-rapidapi-host": host });

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function searchSpotify(query, limit = 5) {
  const url = `https://${SPOTIFY_HOST}/search/?q=${encodeURIComponent(query)}&type=tracks&offset=0&limit=${limit}&numberOfTopResults=${limit}`;
  const res = await fetch(url, { headers: rapid(SPOTIFY_HOST), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Spotify API HTTP ${res.status}`);
  const json = await res.json();
  return (json.tracks?.items || []).map((i) => i.data).filter(Boolean).map((t) => ({
    id: t.id,
    title: t.name,
    artists: (t.artists?.items || []).map((a) => a.profile?.name).filter(Boolean).join(", "),
    album: t.albumOfTrack?.name || "",
    cover: t.albumOfTrack?.coverArt?.sources?.at(-1)?.url || t.albumOfTrack?.coverArt?.sources?.[0]?.url,
    durationMs: t.duration?.totalMilliseconds || 0,
    url: `https://open.spotify.com/track/${t.id}`,
  }));
}

/** Cari video YouTube yang durasinya paling dekat dengan lagu Spotify. */
async function findYoutube(track) {
  const client = await getYt();
  const res = await client.search(`${track.artists} ${track.title} audio`, { type: "video" });
  const videos = (res.videos || []).filter((v) => v.id && v.duration?.seconds).slice(0, 8);
  if (!videos.length) throw new Error("Lagu tidak ditemukan di YouTube.");
  const target = track.durationMs / 1000;
  const scored = videos.map((v, i) => ({ v, score: Math.abs(v.duration.seconds - target) + i * 3 }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0].v.id;
}

async function ytstreamInfo(videoId) {
  const res = await fetch(`https://${YTSTREAM_HOST}/dl?id=${videoId}`, { headers: rapid(YTSTREAM_HOST), signal: AbortSignal.timeout(30_000) });
  const data = await res.json();
  if (data.status !== "OK") throw new Error(data.msg || data.error || "YTStream gagal.");
  return data;
}

async function fetchBuffer(url) {
  // Header Range wajib — tanpa ini googlevideo sering 403
  const res = await fetch(url, { headers: { Range: "bytes=0-" }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Unduh audio m4a. Coba 2x link audio-only, terakhir ambil dari video mp4 lalu pisahkan audionya. */
async function downloadAudio(videoId) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await ytstreamInfo(videoId);
      const audio = (data.adaptiveFormats || [])
        .filter((f) => f.mimeType?.startsWith("audio/mp4") && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (audio) return await fetchBuffer(audio.url);
      const muxed = (data.formats || []).find((f) => f.url);
      if (!muxed) throw new Error("Tidak ada format audio.");
      const input = tmp("mp4"), output = tmp("m4a");
      try {
        fs.writeFileSync(input, await fetchBuffer(muxed.url));
        await run("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-vn", "-c:a", "copy", output]);
        return fs.readFileSync(output);
      } finally {
        cleanup(input, output);
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export default async ({ sock, msg, from, text }) => {
  const query = (text || "").replace(/^\S+\s?/, "").trim();
  if (!query) {
    await sock.sendMessage(from, { text: "🎵 *Cari Lagu Spotify*\nContoh: *.spotify hindia evaluasi*\nAlias: .sp / .play" }, { quoted: msg });
    return;
  }
  if (!process.env.RAPIDAPI_KEY) {
    await sock.sendMessage(from, { text: "⚠️ RAPIDAPI_KEY belum diatur di server." }, { quoted: msg });
    return;
  }

  await sock.sendMessage(from, { react: { text: "🔎", key: msg.key } });
  try {
    const tracks = await searchSpotify(query);
    if (!tracks.length) {
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { text: `❌ Lagu "${query}" tidak ditemukan.` }, { quoted: msg });
      return;
    }
    const [top, ...others] = tracks;
    let caption =
      `🎵 *${top.title}*\n👤 ${top.artists}\n💿 ${top.album}\n⏱️ ${fmtDuration(top.durationMs)}\n🔗 ${top.url}`;
    if (others.length) {
      caption += `\n\n*Hasil lain:*\n` + others.map((t, i) => `${i + 2}. ${t.title} — ${t.artists}`).join("\n");
    }
    caption += `\n\n⏳ Mengirim audio...`;
    if (top.cover) await sock.sendMessage(from, { image: { url: top.cover }, caption }, { quoted: msg });
    else await sock.sendMessage(from, { text: caption }, { quoted: msg });

    const videoId = await findYoutube(top);
    const audio = await downloadAudio(videoId);
    if (audio.length > MAX_AUDIO_BYTES) throw new Error("File audio terlalu besar.");
    await sock.sendMessage(
      from,
      { audio, mimetype: "audio/mp4", fileName: `${top.artists} - ${top.title}.m4a` },
      { quoted: msg }
    );
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
  } catch (err) {
    console.error("❌ Spotify error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
    await sock.sendMessage(from, { text: `❌ Gagal mengambil lagu.\n${err.message}` }, { quoted: msg });
  }
};
