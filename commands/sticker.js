// commands/sticker.js — Pembuatan Stiker & Konversi
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { addExifToWebpBuffer } from "../utils/exif.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pastikan folder temp ada
const TEMP_DIR = path.join(__dirname, "..", "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export default async (ctx) => {
  const { cmd } = ctx;
  if (cmd === "s") return handleStickerCreate(ctx);
  if (cmd === "toimg" || cmd === "img") return handleStickerToImage(ctx);
  if (cmd === "tomp4") return handleStickerToMP4(ctx);
};

/**
 * Helper: jalankan command dan return Promise
 */
function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[${cmd}] stderr:`, stderr);
        return reject(new Error(`${cmd} gagal: ${err.message}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

/* ===== .s: Gambar/Video → Sticker ===== */
async function handleStickerCreate({ sock, msg, from, getMediaBuffer }) {
  const media = await getMediaBuffer(msg);
  if (!media) {
    await sock.sendMessage(from, { text: "Reply gambar/video dengan *.s* untuk buat stiker." }, { quoted: msg });
    return;
  }

  try {
    const isImage = media.type === "imageMessage";

    if (isImage) {
      // Gambar → WebP pakai sharp (cross-platform, tanpa perlu ImageMagick)
      const webpBuf = await sharp(media.buffer)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();

      const stickerBuffer = addExifToWebpBuffer(webpBuf);
      await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
    } else {
      // Video → Animated WebP pakai FFmpeg
      const fileId = Date.now();
      const inputPath = path.join(TEMP_DIR, `${fileId}_in.mp4`);
      const webpPath = path.join(TEMP_DIR, `${fileId}_out.webp`);

      fs.writeFileSync(inputPath, media.buffer);

      await runCmd("ffmpeg", [
        "-y", "-i", inputPath,
        "-t", "7",
        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15",
        "-c:v", "libwebp",
        "-loop", "0",
        "-an",
        webpPath,
      ]);

      const rawBuffer = fs.readFileSync(webpPath);
      const stickerBuffer = addExifToWebpBuffer(rawBuffer);
      await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });

      // Cleanup
      try { fs.unlinkSync(inputPath); } catch {}
      try { fs.unlinkSync(webpPath); } catch {}
    }
  } catch (err) {
    console.error("❌ Sticker error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal membuat stiker." }, { quoted: msg });
  }
}

/* ===== Helper: Ambil buffer stiker dari pesan (langsung atau reply) ===== */
async function getStickerBuffer({ msg, downloadContentFromMessage }) {
  let stickerMsg = msg.message?.stickerMessage;

  // Cek jika user reply ke stiker
  if (!stickerMsg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    stickerMsg = quoted?.stickerMessage;
  }

  if (!stickerMsg) return null;

  try {
    const stream = await downloadContentFromMessage(stickerMsg, "sticker");
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  } catch (err) {
    console.error("❌ Download sticker failed:", err.message);
    return null;
  }
}

/* ===== .toimg: Sticker → Gambar JPG ===== */
async function handleStickerToImage({ sock, msg, from, downloadContentFromMessage }) {
  const buffer = await getStickerBuffer({ msg, downloadContentFromMessage });
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
async function handleStickerToMP4({ sock, msg, from, downloadContentFromMessage }) {
  const buffer = await getStickerBuffer({ msg, downloadContentFromMessage });
  if (!buffer) {
    await sock.sendMessage(from, { text: "Reply stiker animasi dengan *.tomp4*." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, `${fileId}.webp`);
  const mp4Path = path.join(TEMP_DIR, `${fileId}.mp4`);

  try {
    fs.writeFileSync(webpPath, buffer);

    // Langsung WebP → MP4 pakai FFmpeg (versi modern sudah support animated webp)
    await runCmd("ffmpeg", [
      "-y", "-i", webpPath,
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
    try { fs.unlinkSync(webpPath); } catch {}
    try { fs.unlinkSync(mp4Path); } catch {}
  }
}
