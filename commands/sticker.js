// commands/sticker.js — Pembuatan Stiker & Konversi
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { addExifToWebpBuffer } = require("../utils/exif");

// Pastikan folder temp ada
const TEMP_DIR = path.join(__dirname, "..", "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

module.exports = async (ctx) => {
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

  const fileId = Date.now();
  const isImage = media.type === "imageMessage";
  const ext = isImage ? "png" : "mp4";
  const inputPath = path.join(TEMP_DIR, `${fileId}_in.${ext}`);
  const webpPath = path.join(TEMP_DIR, `${fileId}_out.webp`);

  fs.writeFileSync(inputPath, media.buffer);

  try {
    if (isImage) {
      // Gambar → WebP pakai ImageMagick (lebih stabil di Termux)
      await runCmd("convert", [
        inputPath,
        "-resize", "512x512",
        "-background", "none",
        "-gravity", "center",
        "-extent", "512x512",
        "-quality", "80",
        webpPath
      ]);
    } else {
      // Video → Animated WebP pakai FFmpeg
      await runCmd("ffmpeg", [
        "-y", "-i", inputPath,
        "-t", "7",
        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:white,fps=15",
        "-c:v", "libwebp",
        "-loop", "0",
        "-an",
        webpPath
      ]);
    }

    // Baca file, tambahkan EXIF metadata, kirim
    const rawBuffer = fs.readFileSync(webpPath);
    const stickerBuffer = addExifToWebpBuffer(rawBuffer);
    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });

  } catch (err) {
    console.error("❌ Sticker error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal membuat stiker." }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(webpPath); } catch {}
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

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, `${fileId}.webp`);
  const jpgPath = path.join(TEMP_DIR, `${fileId}.jpg`);

  try {
    fs.writeFileSync(webpPath, buffer);

    // ImageMagick: ambil frame pertama [0] dan convert ke JPG
    await runCmd("convert", [webpPath + "[0]", "-resize", "512x512", jpgPath]);

    const jpgBuffer = fs.readFileSync(jpgPath);
    await sock.sendMessage(from, { image: jpgBuffer, caption: "✅ Stiker → Gambar\n🤖 *Abd Bot*" }, { quoted: msg });
  } catch (err) {
    console.error("❌ toimg error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal konversi stiker ke gambar." }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(webpPath); } catch {}
    try { fs.unlinkSync(jpgPath); } catch {}
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
  const gifPath = path.join(TEMP_DIR, `${fileId}.gif`);
  const mp4Path = path.join(TEMP_DIR, `${fileId}.mp4`);

  try {
    fs.writeFileSync(webpPath, buffer);

    // STEP 1: WebP → GIF pakai ImageMagick (FFmpeg tidak bisa decode animated WebP di Termux)
    await runCmd("convert", [webpPath, gifPath]);

    // STEP 2: GIF → MP4 pakai FFmpeg
    await runCmd("ffmpeg", [
      "-y", "-i", gifPath,
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-movflags", "faststart",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-r", "20",
      "-t", "10",
      "-an",
      mp4Path
    ]);

    const mp4Buffer = fs.readFileSync(mp4Path);
    await sock.sendMessage(from, { video: mp4Buffer, caption: "✅ Stiker → Video\n🤖 *Abd Bot*", mimetype: "video/mp4" }, { quoted: msg });
  } catch (err) {
    console.error("❌ tomp4 error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal konversi stiker ke video. Pastikan stiker ini animasi." }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(webpPath); } catch {}
    try { fs.unlinkSync(gifPath); } catch {}
    try { fs.unlinkSync(mp4Path); } catch {}
  }
}
