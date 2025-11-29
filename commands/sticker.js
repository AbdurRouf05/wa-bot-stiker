// commands/sticker.js (tanpa sharp, pakai ImageMagick saja)
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

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

    const webpBuffer = fs.readFileSync(webpPath);
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

    const webpBuffer = fs.readFileSync(stickerPath);
    await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg });

    fs.unlinkSync(inputPath);
    fs.unlinkSync(stickerPath);
    return;
  }

  await sock.sendMessage(from, { text: "Tipe media belum didukung untuk stiker." }, { quoted: msg });
}

/* ===== .toimg: sticker → gambar JPG ===== */
async function handleStickerToImage({ sock, msg, from }) {
  const sticker = msg.message?.stickerMessage;
  if (!sticker) {
    await sock.sendMessage(from, { text: "Reply stiker dengan *.toimg* / *.img*." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, fileId + ".webp");
  const jpgPath = path.join(TEMP_DIR, fileId + ".jpg");

  // download stiker WA ke file webp
  const fileBuffer = await sock.downloadMediaMessage(msg);
  fs.writeFileSync(webpPath, fileBuffer);

  // convert pakai ImageMagick
  await new Promise((resolve, reject) => {
    const p = spawn("convert", [webpPath, "-resize", "512x512", jpgPath]);
    p.on("close", (code) => code === 0 ? resolve() : reject());
  });

  const jpgBuffer = fs.readFileSync(jpgPath);
  await sock.sendMessage(from, { image: jpgBuffer, caption: "✅ Stiker berhasil jadi gambar." }, { quoted: msg });

  fs.unlinkSync(webpPath);
  fs.unlinkSync(jpgPath);
}

/* ===== .tomp4: sticker → video MP4 ===== */
async function handleStickerToMP4({ sock, msg, from }) {
  const sticker = msg.message?.stickerMessage;
  if (!sticker) {
    await sock.sendMessage(from, { text: "Reply stiker dengan *.tomp4*." }, { quoted: msg });
    return;
  }

  const fileId = Date.now();
  const webpPath = path.join(TEMP_DIR, fileId + ".webp");
  const mp4Path = path.join(TEMP_DIR, fileId + ".mp4");

  const fileBuffer = await sock.downloadMediaMessage(msg);
  fs.writeFileSync(webpPath, fileBuffer);

  await new Promise((resolve, reject) => {
    ffmpeg(webpPath)
      .outputOptions([
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-movflags", "faststart",
        "-t", "3",
        "-vf", "scale=512:512:flags=lanczos",
        "-r", "15",
        "-an"
      ])
      .on("end", resolve)
      .on("error", reject)
      .save(mp4Path);
  });

  const mp4Buffer = fs.readFileSync(mp4Path);
  await sock.sendMessage(from, { video: mp4Buffer, caption: "✅ Stiker berhasil jadi video.", mimetype: "video/mp4" }, { quoted: msg });

  fs.unlinkSync(webpPath);
  fs.unlinkSync(mp4Path);
}
