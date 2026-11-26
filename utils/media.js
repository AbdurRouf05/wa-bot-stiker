// utils/media.js — Konversi media ke stiker (dipakai .s dan .ss)
import fs from "fs";
import { createRequire } from "module";
import { tmp, run, cleanup } from "../utils.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const S = 512;
// Stiker animasi di atas ~1 MB sering gagal terkirim / tidak tampil di HP.
export const MAX_ANIMATED_BYTES = 950 * 1024;
export const MAX_SECONDS = 8;

/** Gambar → WebP stiker 512x512 (transparan di sisi kosong). */
export async function imageToWebp(buffer) {
  return sharp(buffer, { animated: false })
    .rotate() // ikuti orientasi EXIF dari kamera HP
    .resize(S, S, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
}

// [fps, kualitas, resolusi kerja] — dicoba berurutan sampai ukuran file muat.
const LADDER = [
  [15, 60, 512],
  [12, 50, 512],
  [10, 40, 448],
  [10, 30, 384],
  [8, 25, 320],
  [6, 20, 256],
];

/**
 * Video/GIF → WebP animasi 512x512. Sisi kosong transparan, durasi dipotong ke maxSeconds.
 * Kualitas diturunkan bertahap sampai ukuran ≤ MAX_ANIMATED_BYTES.
 */
export async function videoToAnimatedWebp(inputPath, { maxSeconds = MAX_SECONDS } = {}) {
  const out = tmp("webp");
  try {
    let last = null;
    for (const [fps, quality, detail] of LADDER) {
      const scaleDown = detail < S ? `scale=${detail}:${detail}:force_original_aspect_ratio=decrease,` : "";
      const vf =
        `fps=${fps},${scaleDown}scale=${S}:${S}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `format=rgba,pad=${S}:${S}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p`;
      await run("ffmpeg", [
        "-y", "-loglevel", "error",
        "-t", String(maxSeconds), "-i", inputPath,
        "-map", "0:v:0", "-an", "-sn",
        "-vf", vf,
        "-c:v", "libwebp_anim", "-lossless", "0", "-quality", String(quality),
        "-compression_level", "4", "-loop", "0",
        "-f", "webp", out,
      ]);
      last = fs.readFileSync(out);
      if (last.length <= MAX_ANIMATED_BYTES) return last;
    }
    return last; // tetap kirim versi terkecil
  } finally {
    cleanup(out);
  }
}

/** Cek apakah file punya trek audio. */
export async function hasAudioStream(inputPath) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-select_streams", "a",
      "-show_entries", "stream=index", "-of", "csv=p=0", inputPath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Ambil audio → Ogg Opus mono 48 kHz (format yang dipakai stiker bersuara WhatsApp).
 * Return { audio, seconds }.
 */
export async function extractOpus(inputPath, { maxSeconds = MAX_SECONDS } = {}) {
  const out = tmp("ogg");
  try {
    const fadeOutStart = Math.max(0, maxSeconds - 0.15).toFixed(2);
    await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-t", String(maxSeconds), "-i", inputPath,
      "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-ac", "1", "-ar", "48000",
      "-af", `afade=t=in:d=0.02,afade=t=out:st=${fadeOutStart}:d=0.15`,
      "-c:a", "libopus", "-b:a", "48k", "-application", "audio",
      "-map_metadata", "-1", "-f", "ogg", out,
    ]);
    const audio = fs.readFileSync(out);
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out,
    ]);
    const seconds = Math.min(maxSeconds, Math.max(1, Math.round(parseFloat(stdout) || maxSeconds)));
    return { audio, seconds };
  } finally {
    cleanup(out);
  }
}
