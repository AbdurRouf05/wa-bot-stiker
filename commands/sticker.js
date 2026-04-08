// commands/sticker.js — Pembuatan Stiker & Konversi (Unified FFmpeg)
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { addExifToWebpBuffer } = require("../utils/exif");

// Pastikan folder temp ada
const TEMP_DIR = path.join(__dirname, "..", "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

module.exports = async (ctx) => {
  const { cmd } = ctx;
  if (cmd === "s") return handleStickerCreate(ctx);
  if (cmd === "toimg" || cmd === "img") return handleStickerToImage(ctx);
  if (cmd === "tomp4") return handleStickerToMP4(ctx);
};

/* ===== .s: Gambar/Video → Sticker (Unified FFmpeg) ===== */
async function handleStickerCreate({ sock, msg, from, getMediaBuffer }) {
  const media = await getMediaBuffer(msg);
  if (!media) {
    await sock.sendMessage(from, { text: "Reply media dengan *.s* untuk buat stiker." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const inputPath = path.join(TEMP_DIR, `${fileId}_in.${media.type.startsWith("image") ? "png" : "mp4"}`);
  const webpPath = path.join(TEMP_DIR, `${fileId}_out.webp`);
  
  fs.writeFileSync(inputPath, media.buffer);

  try {
    // Gunakan FFmpeg untuk semua jenis media (Gambar/Video)
    // FFmpeg lebih handal dalam menangani transparansi dan metadata WebP
    const ff = ffmpeg(inputPath);
    
    // Jika video, potong maksimal 7 detik
    if (media.type === "videoMessage") {
      ff.inputOptions(["-t", "7"]);
    }

    await new Promise((resolve, reject) => {
      ff.outputOptions([
        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0,fps=15",
        "-c:v", "libwebp",
        "-loop", "0",
        "-an"
      ])
      .on("end", resolve)
      .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .save(webpPath);
    });

    // Baca hasil, tambahkan EXIF, lalu kirim
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

/* ===== Helper: Ambil buffer stiker (Langsung atau Reply) ===== */
async function getStickerBuffer({ msg, downloadContentFromMessage }) {
  let stickerMsg = msg.message?.stickerMessage;

  // Cek jika reply ke stiker
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
    return { buffer, isAnimated: stickerMsg.isAnimated || false };
  } catch (err) {
    console.error("❌ Download sticker failed:", err.message);
    return null;
  }
}

/* ===== .toimg: Sticker → Gambar JPG ===== */
async function handleStickerToImage({ sock, msg, from, downloadContentFromMessage }) {
  const sticker = await getStickerBuffer({ msg, downloadContentFromMessage });
  if (!sticker) {
    await sock.sendMessage(from, { text: "Reply stiker dengan *.toimg*." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, `${fileId}.webp`);
  const jpgPath = path.join(TEMP_DIR, `${fileId}.jpg`);

  try {
    fs.writeFileSync(webpPath, sticker.buffer);

    // Gunakan FFmpeg untuk konversi stiker ke gambar (frame pertama)
    await new Promise((resolve, reject) => {
      ffmpeg(webpPath)
        .frames(1)
        .save(jpgPath)
        .on("end", resolve)
        .on("error", reject);
    });

    const jpgBuffer = fs.readFileSync(jpgPath);
    await sock.sendMessage(from, { image: jpgBuffer, caption: "✅ Berhasil konversi stiker ke gambar." }, { quoted: msg });
  } catch (err) {
    console.error("❌ toimg error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal konversi ke gambar." }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(webpPath); } catch {}
    try { fs.unlinkSync(jpgPath); } catch {}
  }
}

/* ===== .tomp4: Sticker → Video MP4 ===== */
async function handleStickerToMP4({ sock, msg, from, downloadContentFromMessage }) {
  const sticker = await getStickerBuffer({ msg, downloadContentFromMessage });
  if (!sticker) {
    await sock.sendMessage(from, { text: "Reply stiker animasi dengan *.tomp4*." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, `${fileId}.webp`);
  const mp4Path = path.join(TEMP_DIR, `${fileId}.mp4`);

  try {
    fs.writeFileSync(webpPath, sticker.buffer);

    await new Promise((resolve, reject) => {
      ffmpeg(webpPath)
        .inputOptions([
          "-analyzeduration", "10M",
          "-probesize", "10M"
        ])
        .outputOptions([
          "-pix_fmt", "yuv420p",
          "-c:v", "libx264",
          "-movflags", "faststart",
          "-vf", "scale='if(gt(iw,ih),512,-2)':'if(gt(ih,iw),512,-2)',pad=512:512:(512-iw)/2:(512-ih)/2:color=black",
          "-r", "20",
          "-t", "10"
        ])
        .on("end", resolve)
        .on("error", (err, stdout, stderr) => {
          console.error("FFmpeg ToMP4 error:", stderr);
          reject(err);
        })
        .save(mp4Path);
    });

    const mp4Buffer = fs.readFileSync(mp4Path);
    await sock.sendMessage(from, { video: mp4Buffer, caption: "✅ Berhasil konversi stiker ke video.", mimetype: "video/mp4" }, { quoted: msg });
  } catch (err) {
    console.error("❌ tomp4 error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal konversi stiker animasi ke video." }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(webpPath); } catch {}
    try { fs.unlinkSync(mp4Path); } catch {}
  }
}
