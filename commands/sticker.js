// commands/sticker.js (dengan watermark EXIF metadata)
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { addExifToWebp, addExifToWebpBuffer } = require("../utils/exif");

// pastikan folder temp ada
const TEMP_DIR = path.join(__dirname, "..", "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// helper untuk running command di Termux (spawn child process)
const { spawn } = require("child_process");

module.exports = async (ctx) => {
  const { cmd } = ctx;
  if (cmd === "s") return handleStickerCreate(ctx);
  if (cmd === "toimg" || cmd === "img") return handleStickerToImage(ctx);
  if (cmd === "tomp4") return handleStickerToMP4(ctx);
};

/* ===== .s: gambar/video → sticker ===== */
async function handleStickerCreate({ sock, msg, from, getMediaBuffer }) {
  const media = await getMediaBuffer(msg);
  if (!media) {
    await sock.sendMessage(
      from,
      { text: "Reply media dengan *.s* untuk buat stiker." },
      { quoted: msg }
    );
    return;
  }

  // jika foto → convert ke webp pakai ImageMagick
  if (media.type === "imageMessage") {
    const inputPath = path.join(TEMP_DIR, Date.now() + ".png");
    fs.writeFileSync(inputPath, media.buffer);

    const webpPath = path.join(TEMP_DIR, Date.now() + ".webp");

    await new Promise((resolve, reject) => {
      const p = spawn("convert", [inputPath, "-resize", "512x512", webpPath]);
      p.on("close", (code) => code === 0 ? resolve() : reject());
    });

    // Tambahkan watermark EXIF metadata
    const webpBuffer = addExifToWebp(webpPath);
    await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg });

    fs.unlinkSync(inputPath);
    fs.unlinkSync(webpPath);
    return;
  }

  // jika video → fluent-ffmpeg sudah otomatis pakai FFmpeg sistem
  if (media.type === "videoMessage") {
    const inputPath = path.join(TEMP_DIR, Date.now() + ".mp4");
    const stickerPath = path.join(TEMP_DIR, Date.now() + ".webp");

    fs.writeFileSync(inputPath, media.buffer);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions(["-t", "7"])
        .outputOptions([
          "-vf",
          "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white,fps=14",
          "-c:v", "libwebp", "-loop", "0", "-an"
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(stickerPath);
    });

    // Tambahkan watermark EXIF metadata
    const webpBuffer = addExifToWebp(stickerPath);
    await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg });

    fs.unlinkSync(inputPath);
    fs.unlinkSync(stickerPath);
    return;
  }

  await sock.sendMessage(from, { text: "Tipe media belum didukung untuk stiker." }, { quoted: msg });
}

/* ===== Helper: ambil buffer stiker (langsung atau reply) ===== */
async function getStickerBuffer({ msg, downloadContentFromMessage }) {
  let stickerMsg = msg.message?.stickerMessage;

  // Cek kalau user reply ke stiker
  if (!stickerMsg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    stickerMsg = quoted?.stickerMessage;
  }

  if (!stickerMsg) return null;

  // Download stiker pakai downloadContentFromMessage
  const stream = await downloadContentFromMessage(stickerMsg, "sticker");
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }

  return { buffer, isAnimated: stickerMsg.isAnimated || false };
}

/* ===== .toimg: sticker → gambar JPG ===== */
async function handleStickerToImage({ sock, msg, from, downloadContentFromMessage }) {
  const sticker = await getStickerBuffer({ msg, downloadContentFromMessage });
  if (!sticker) {
    await sock.sendMessage(from, { text: "Kirim atau reply stiker dengan *.toimg* / *.img*." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, fileId + ".webp");
  const jpgPath = path.join(TEMP_DIR, fileId + ".jpg");

  try {
    fs.writeFileSync(webpPath, sticker.buffer);

    // convert pakai ImageMagick
    await new Promise((resolve, reject) => {
      const p = spawn("convert", [webpPath + "[0]", "-resize", "512x512", jpgPath]);
      p.on("close", (code) => code === 0 ? resolve() : reject(new Error("ImageMagick convert gagal")));
      p.on("error", reject);
    });

    const jpgBuffer = fs.readFileSync(jpgPath);
    await sock.sendMessage(from, { image: jpgBuffer, caption: "✅ Stiker → Gambar\n🤖 *Abd Bot*" }, { quoted: msg });
  } catch (err) {
    console.error("❌ toimg error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal convert stiker ke gambar." }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(webpPath); } catch {}
    try { fs.unlinkSync(jpgPath); } catch {}
  }
}

/* ===== .tomp4: sticker → video MP4 ===== */
async function handleStickerToMP4({ sock, msg, from, downloadContentFromMessage }) {
  const sticker = await getStickerBuffer({ msg, downloadContentFromMessage });
  if (!sticker) {
    await sock.sendMessage(from, { text: "Kirim atau reply stiker *animasi* dengan *.tomp4*." }, { quoted: msg });
    return;
  }

  if (!sticker.isAnimated) {
    await sock.sendMessage(from, { text: "⚠️ Stiker ini bukan animasi. Pakai *.toimg* untuk convert ke gambar." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, fileId + ".webp");
  const mp4Path = path.join(TEMP_DIR, fileId + ".mp4");

  try {
    fs.writeFileSync(webpPath, sticker.buffer);

    await new Promise((resolve, reject) => {
      ffmpeg(webpPath)
        .outputOptions([
          "-pix_fmt", "yuv420p",
          "-c:v", "libx264",
          "-movflags", "faststart",
          "-t", "7",
          "-vf", "scale=512:512:flags=lanczos",
          "-r", "15",
          "-an"
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(mp4Path);
    });

    const mp4Buffer = fs.readFileSync(mp4Path);
    await sock.sendMessage(from, { video: mp4Buffer, caption: "✅ Stiker → Video\n🤖 *Abd Bot*", mimetype: "video/mp4" }, { quoted: msg });
  } catch (err) {
    console.error("❌ tomp4 error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal convert stiker ke video." }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(webpPath); } catch {}
    try { fs.unlinkSync(mp4Path); } catch {}
  }
}

