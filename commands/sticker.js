// commands/sticker.js
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const sharp = require("sharp");

// Membuat folder 'temp' di root project (SOLUSI PATH LOKAL)
const TEMP_DIR = path.join(__dirname, "..", "temp"); 
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

ffmpeg.setFfmpegPath(ffmpegPath);
console.log("FFmpeg static path:", ffmpegPath);

module.exports = async (ctx) => {
  const { cmd } = ctx;

  if (cmd === "s") return handleS(ctx);
  if (cmd === "toimg" || cmd === "img") return handleToImg(ctx);
  if (cmd === "tomp4") return handleToMp4(ctx);
};

/* ===================== .s ===================== */
// foto / video → sticker
async function handleS({ sock, msg, from, getMediaBuffer, tmp }) {
  const media = await getMediaBuffer(msg);
  if (!media) {
    await sock.sendMessage(
      from,
      {
        text:
          "❌ Gagal mengambil media\n" +
          "• Jangan pakai view-once\n" +
          "• Kirim foto/video langsung atau reply media dengan *.s*",
      },
      { quoted: msg }
    );
    return;
  }

  const { buffer, type } = media;

  // FOTO → sticker webp
  if (type === "imageMessage") {
    const webpBuf = await sharp(buffer).webp({ quality: 95 }).toBuffer();
    await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
    return;
  }

  // VIDEO → sticker animasi webp
  if (type === "videoMessage") {
    const inP = path.join(TEMP_DIR, `${Date.now()}-in.mp4`);
    const outP = path.join(TEMP_DIR, `${Date.now()}-out.webp`);
    
    fs.writeFileSync(inP, buffer);

    await new Promise((res, rej) =>
      ffmpeg(inP)
        .inputOptions(["-t", "7"])
        .videoCodec("libwebp")
        .outputOptions([
          "-vf",
          "scale=512:512:force_original_aspect_ratio=decrease,fps=14,pad=512:512:-1:-1:color=white",
          "-loop",
          "0",
          "-an",
        ])
        .on("start", (c) => console.log("[.s] ffmpeg:", c))
        .on("end", res)
        .on("error", rej)
        .save(outP)
    );

    const outBuf = fs.readFileSync(outP);
    await sock.sendMessage(from, { sticker: outBuf }, { quoted: msg });

    fs.unlinkSync(inP);
    fs.unlinkSync(outP);
    return;
  }

  await sock.sendMessage(
    from,
    { text: "Tipe media belum didukung untuk *.s*." },
    { quoted: msg }
  );
}

/* ===================== .toimg ===================== */
// sticker → gambar JPG
async function handleToImg({ sock, msg, from, getMediaBuffer }) {
  const media = await getMediaBuffer(msg);
  if (!media || media.type !== "stickerMessage") {
    await sock.sendMessage(
      from,
      { text: "Reply stiker dengan *.toimg* / *.img*." },
      { quoted: msg }
    );
    return;
  }

  const jpg = await sharp(media.buffer).jpeg({ quality: 95 }).toBuffer();

  await sock.sendMessage(
    from,
    { image: jpg, caption: "Hasil dari stiker 👍" },
    { quoted: msg }
  );
}
/* ===================== .tomp4 (FIXED: Animasi & Statis) ===================== */
// sticker (statis / animasi) → video mp4
async function handleToMp4({ sock, msg, from, getMediaBuffer }) {
    const media = await getMediaBuffer(msg);
    if (!media || media.type !== "stickerMessage") {
        await sock.sendMessage(from, { text: "Reply stiker dengan *.tomp4*." }, { quoted: msg });
        return;
    }

    const fileId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const webpPath = path.join(TEMP_DIR, `${fileId}.webp`);
    const mp4Path = path.join(TEMP_DIR, `${fileId}.mp4`);
    
    // Simpan stiker WebP asli
    fs.writeFileSync(webpPath, media.buffer);

    try {
        // Deteksi apakah stiker animasi atau statis
        const sticker = msg.message?.stickerMessage;
        const isAnimated = sticker?.isAnimated || false;

        console.log(`[.tomp4] Stiker ${isAnimated ? 'ANIMASI' : 'STATIS'}`);

        if (isAnimated) {
            // ===== STIKER ANIMASI -> VIDEO MP4 =====
            await new Promise((resolve, reject) => {
                ffmpeg(webpPath)
                    // Untuk WebP animasi, gunakan demuxer webp_pipe
                    .inputOptions(["-y"])
                    .outputOptions([
                        "-pix_fmt", "yuv420p",
                        "-c:v", "libx264",
                        "-profile:v", "baseline",
                        "-level", "3.0",
                        "-movflags", "faststart",
                        "-vf", "scale=512:512:flags=lanczos",
                        "-r", "15", // Frame rate
                        "-an" // No audio
                    ])
                    .on("start", (cmd) => console.log("[.tomp4 ANIMASI] ffmpeg:", cmd))
                    .on("progress", (progress) => {
                        console.log(`[.tomp4 ANIMASI] Progress: ${progress.percent}%`);
                    })
                    .on("end", () => {
                        console.log("[.tomp4 ANIMASI] Konversi selesai");
                        resolve();
                    })
                    .on("error", (err, stdout, stderr) => {
                        console.error("[.tomp4 ANIMASI] Error:", err);
                        console.error("[.tomp4 ANIMASI] stderr:", stderr);
                        reject(err);
                    })
                    .save(mp4Path);
            });
        } else {
            // ===== STIKER STATIS -> VIDEO MP4 =====
            const pngPath = path.join(TEMP_DIR, `${fileId}.png`);
            
            // Convert WebP ke PNG dulu
            await sharp(media.buffer)
                .resize(512, 512, { 
                    fit: 'contain', 
                    background: { r: 255, g: 255, b: 255, alpha: 0 } 
                })
                .png()
                .toFile(pngPath);

            await new Promise((resolve, reject) => {
                ffmpeg(pngPath)
                    .inputOptions(["-loop", "1", "-y"])
                    .outputOptions([
                        "-t", "3", // Durasi 3 detik
                        "-pix_fmt", "yuv420p",
                        "-c:v", "libx264",
                        "-profile:v", "baseline", 
                        "-level", "3.0",
                        "-r", "25", // Frame rate
                        "-an" // No audio
                    ])
                    .on("start", (cmd) => console.log("[.tomp4 STATIS] ffmpeg:", cmd))
                    .on("end", () => {
                        console.log("[.tomp4 STATIS] Konversi selesai");
                        resolve();
                    })
                    .on("error", (err, stdout, stderr) => {
                        console.error("[.tomp4 STATIS] Error:", err);
                        console.error("[.tomp4 STATIS] stderr:", stderr);
                        reject(err);
                    })
                    .save(mp4Path);
            });

            // Hapus file PNG temporary
            try { fs.unlinkSync(pngPath); } catch (e) {}
        }

        // Verifikasi file hasil
        if (!fs.existsSync(mp4Path)) {
            throw new Error("File MP4 tidak ditemukan setelah konversi");
        }

        const stats = fs.statSync(mp4Path);
        if (stats.size === 0) {
            throw new Error("File MP4 hasil konversi kosong");
        }

        console.log(`[.tomp4] File berhasil: ${stats.size} bytes`);

        // Baca dan kirim video
        const videoBuffer = fs.readFileSync(mp4Path);
        
        await sock.sendMessage(
            from,
            { 
                video: videoBuffer,
                caption: `✅ Hasil .tomp4 (${isAnimated ? 'Animasi' : 'Statis'})`,
                mimetype: "video/mp4"
            },
            { quoted: msg }
        );

    } catch (error) {
        console.error("❌ Error di .tomp4:", error);
        await sock.sendMessage(
            from,
            { 
                text: `❌ Gagal convert stiker ${sticker?.isAnimated ? 'animasi' : 'statis'}:\n${error.message}` 
            },
            { quoted: msg }
        );
    } finally {
        // Bersihkan file temporary
        try {
            if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
            if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
        } catch (e) { 
            console.log("Cleanup error:", e); 
        }
    }
}