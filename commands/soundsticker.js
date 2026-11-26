// commands/soundsticker.js — .ss: Video → Stiker bersuara (stiker animasi + suara)
import fs from "fs";
import crypto from "crypto";
import { tmp, cleanup, mediaKind } from "../utils.js";
import { videoToAnimatedWebp, hasAudioStream, extractOpus, MAX_SECONDS } from "../utils/media.js";
import { addExifToWebpBuffer } from "../utils/exif.js";
import { sendSoundSticker } from "../utils/soundSticker.js";

export const aliases = ["ss", "ssound", "stikersound", "stickersound", "sstiker"];

export default async ({ sock, msg, from, getMediaBuffer }) => {
  const media = await getMediaBuffer(msg);
  const kind = mediaKind(media);
  if (kind !== "video") {
    await sock.sendMessage(
      from,
      { text: `🔊 *Stiker Bersuara*\nKirim video dengan caption *.ss* atau reply video dengan *.ss*.\n\n• Maksimal ${MAX_SECONDS} detik pertama dipakai\n• Suara bisa diputar penerima dengan tap ikon 🔊 di stiker\n• Fitur baru WhatsApp — HP yang belum update akan melihat stiker tanpa suara` },
      { quoted: msg }
    );
    return;
  }

  await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
  const input = tmp("mp4");
  try {
    fs.writeFileSync(input, media.buffer);
    const [rawWebp, withAudio] = await Promise.all([videoToAnimatedWebp(input), hasAudioStream(input)]);

    if (!withAudio) {
      const sticker = await addExifToWebpBuffer(rawWebp);
      await sock.sendMessage(from, { sticker }, { quoted: msg });
      await sock.sendMessage(from, { text: "ℹ️ Video ini tidak punya suara, jadi dikirim sebagai stiker biasa." }, { quoted: msg });
      return;
    }

    const { audio, seconds } = await extractOpus(input);
    const soundSha = crypto.createHash("sha256").update(audio).digest("base64");
    const webp = await addExifToWebpBuffer(rawWebp, undefined, undefined, {
      emojis: ["🔊"],
      "sound-sha256": soundSha,
    });

    await sendSoundSticker(sock, from, { webp, audio, seconds, quoted: msg });
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
  } catch (err) {
    console.error("❌ Sound sticker error:", err);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
    await sock.sendMessage(from, { text: `❌ Gagal membuat stiker bersuara.\n${err.message}` }, { quoted: msg });
  } finally {
    cleanup(input);
  }
};
