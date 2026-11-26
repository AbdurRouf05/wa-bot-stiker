// commands/sticker.js — Pembuatan Stiker & Konversi
import fs from "fs";
import { createRequire } from "module";
import { addExifToWebpBuffer } from "../utils/exif.js";
import { tmp, run, cleanup, mediaKind, unwrapMessage, getContextInfo } from "../utils.js";
import { imageToWebp, videoToAnimatedWebp } from "../utils/media.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

export const aliases = ["s", "stiker", "toimg", "img", "tomp4"];

export default async (ctx) => {
  const { cmd } = ctx;
  if (cmd === "toimg" || cmd === "img") return handleStickerToImage(ctx);
  if (cmd === "tomp4") return handleStickerToMP4(ctx);
  return handleStickerCreate(ctx);
};

/* ===== .s: Gambar/Video → Sticker (termasuk foto/video sekali lihat) ===== */
async function handleStickerCreate({ sock, msg, from, getMediaBuffer }) {
  let media;
  try {
    media = await getMediaBuffer(msg);
  } catch (err) {
    console.error("❌ Download media .s gagal:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal mengunduh media. Kalau ini foto sekali lihat, kirim ulang fotonya dengan caption *.s* (media sekali lihat yang sudah dibuka tidak bisa diunduh lagi)." }, { quoted: msg });
    return;
  }

  const kind = mediaKind(media);
  if (!["image", "video", "sticker"].includes(kind)) {
    if (!media) logMissingMedia(msg);
    await sock.sendMessage(from, { text: "Kirim/reply gambar atau video (juga foto *sekali lihat*) dengan *.s* untuk buat stiker." }, { quoted: msg });
    return;
  }

  const inputPath = tmp("bin");
  try {
    let webpBuf;
    if (kind === "image") {
      webpBuf = await imageToWebp(media.buffer);
    } else if (kind === "sticker") {
      // Reply stiker orang lain → ganti metadata jadi milik bot
      webpBuf = media.buffer;
    } else {
      fs.writeFileSync(inputPath, media.buffer);
      webpBuf = await videoToAnimatedWebp(inputPath);
    }

    const stickerBuffer = await addExifToWebpBuffer(webpBuf);
    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
  } catch (err) {
    console.error("❌ Sticker error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal membuat stiker." }, { quoted: msg });
  } finally {
    cleanup(inputPath);
  }
}

// Bantu debugging di log server kalau ada format pesan baru dari WhatsApp
function logMissingMedia(msg) {
  const top = Object.keys(msg.message || {});
  const inner = Object.keys(unwrapMessage(msg.message));
  const quoted = getContextInfo(msg.message)?.quotedMessage;
  console.log("[.s] media tidak ditemukan. keys:", top, "inner:", inner, "quoted:", quoted ? Object.keys(quoted) : null);
}

/* ===== Helper: Ambil buffer stiker dari pesan (langsung atau reply) ===== */
async function getStickerBuffer({ msg, getMediaBuffer }) {
  try {
    const media = await getMediaBuffer(msg);
    return media?.type === "stickerMessage" ? media.buffer : null;
  } catch (err) {
    console.error("❌ Download sticker failed:", err.message);
    return null;
  }
}

/* ===== .toimg: Sticker → Gambar JPG ===== */
async function handleStickerToImage({ sock, msg, from, getMediaBuffer }) {
  const buffer = await getStickerBuffer({ msg, getMediaBuffer });
  if (!buffer) {
    await sock.sendMessage(from, { text: "Reply stiker dengan *.toimg* / *.img*." }, { quoted: msg });
    return;
  }

  try {
    // Konversi pakai sharp (cross-platform, tanpa ImageMagick)
    const jpgBuffer = await sharp(buffer, { animated: false })
      .resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer();

    await sock.sendMessage(from, { image: jpgBuffer, caption: "✅ Stiker → Gambar\n🤖 *Abd Bot*" }, { quoted: msg });
  } catch (err) {
    console.error("❌ toimg error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal konversi stiker ke gambar." }, { quoted: msg });
  }
}

/* ===== .tomp4: Sticker Animasi → Video MP4 ===== */
async function handleStickerToMP4({ sock, msg, from, getMediaBuffer }) {
  const buffer = await getStickerBuffer({ msg, getMediaBuffer });
  if (!buffer) {
    await sock.sendMessage(from, { text: "Reply stiker animasi dengan *.tomp4*." }, { quoted: msg });
    return;
  }

  const gifPath = tmp("gif");
  const mp4Path = tmp("mp4");

  try {
    // Gunakan sharp untuk mengonversi animated webp ke gif
    await sharp(buffer, { animated: true })
      .gif()
      .toFile(gifPath);

    // Konversi GIF ke MP4 pakai FFmpeg (FFmpeg lebih stabil baca GIF daripada WebP animasi)
    await run("ffmpeg", [
      "-y", "-i", gifPath,
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-movflags", "faststart",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-r", "20",
      "-t", "10",
      "-an",
      mp4Path,
    ]);

    const mp4Buffer = fs.readFileSync(mp4Path);
    await sock.sendMessage(from, { video: mp4Buffer, caption: "✅ Stiker → Video\n🤖 *Abd Bot*", mimetype: "video/mp4" }, { quoted: msg });
  } catch (err) {
    console.error("❌ tomp4 error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal konversi stiker ke video. Pastikan stiker ini animasi." }, { quoted: msg });
  } finally {
    cleanup(gifPath, mp4Path);
  }
}
