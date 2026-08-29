// commands/brat.js — Generator Stiker & Animasi Brat (Charli XCX Aesthetic)
import { createRequire } from "module";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { addExifToWebpBuffer } from "../utils/exif.js";

const require = createRequire(import.meta.url);

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let createCanvas, GlobalFonts;
try {
  ({ createCanvas, GlobalFonts } = require("@napi-rs/canvas"));
  if (GlobalFonts) {
    const fontsDir = path.join(__dirname, "..", "assets", "fonts");
    const regularFont = path.join(fontsDir, "Noto-Regular.ttf");
    const boldFont = path.join(fontsDir, "Noto-Bold.ttf");
    const emojiFont = path.join(fontsDir, "Noto-Emoji.ttf");

    if (fs.existsSync(regularFont)) GlobalFonts.registerFromPath(regularFont, "NotoSans");
    if (fs.existsSync(boldFont)) GlobalFonts.registerFromPath(boldFont, "NotoSansBold");
    if (fs.existsSync(emojiFont)) GlobalFonts.registerFromPath(emojiFont, "NotoEmoji");
  }
} catch (e) {
  createCanvas = null;
  GlobalFonts = null;
  console.log("[brat] Module '@napi-rs/canvas' tidak tersedia di environment ini.");
}

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
  console.log("[brat] Module 'sharp' tidak tersedia di environment ini.");
}

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 35000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} gagal: ${err.message}`));
      resolve({ stdout, stderr });
    });
  });
}

const BRAT_THEMES = {
  lime: { bg: "#8ACE00", text: "#000000" },      // Iconic Brat Green
  green: { bg: "#8ACE00", text: "#000000" },
  white: { bg: "#ffffff", text: "#000000" },
  black: { bg: "#000000", text: "#ffffff" },
  pink: { bg: "#ff5da2", text: "#000000" },
  cyan: { bg: "#00f0ff", text: "#000000" },
  yellow: { bg: "#ffe600", text: "#000000" },
  red: { bg: "#ff1e42", text: "#ffffff" },
};

const FONT_FAMILY = 'Arial, "Helvetica Neue", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export default async (ctx) => {
  const { sock, msg, from, args, cmd } = ctx;

  if (!createCanvas || !sharp) {
    await sock.sendMessage(from, {
      text: "Fitur *.brat* memerlukan module *@napi-rs/canvas* dan *sharp*.",
    }, { quoted: msg });
    return;
  }

  // Tentukan apakah mode animasi (dari command .bratvid / .bratgif atau flag -a / -v)
  let isAnimated = cmd === "bratvid" || cmd === "bratgif";
  let rawArgs = [...args];

  if (rawArgs.length > 0 && (rawArgs[0] === "-a" || rawArgs[0] === "-v" || rawArgs[0] === "anim")) {
    isAnimated = true;
    rawArgs = rawArgs.slice(1);
  }

  // Cek tema warna
  let theme = BRAT_THEMES.lime;
  if (rawArgs.length > 0) {
    const first = rawArgs[0].toLowerCase();
    if (BRAT_THEMES[first]) {
      theme = BRAT_THEMES[first];
      rawArgs = rawArgs.slice(1);
    } else if (/^#[0-9a-f]{6}$/i.test(first) || /^#[0-9a-f]{3}$/i.test(first)) {
      theme = {
        bg: first,
        text: isColorLight(first) ? "#000000" : "#ffffff"
      };
      rawArgs = rawArgs.slice(1);
    }
  }

  let text = rawArgs.join(" ").trim();

  // Jika teks kosong, cek apakah me-reply pesan
  if (!text) {
    const ext = msg.message?.extendedTextMessage;
    const qMsg = ext?.contextInfo?.quotedMessage;
    if (qMsg) {
      text =
        qMsg.conversation ||
        qMsg.extendedTextMessage?.text ||
        qMsg.imageMessage?.caption ||
        qMsg.videoMessage?.caption ||
        "";
    }
  }

  if (!text) {
    await sock.sendMessage(from, {
      text: "💚 *Format Penggunaan BRAT*:\n\n" +
            "• Stiker Brat: `.brat [teks]`\n" +
            "• Brat Bergerak (Animasi): `.bratvid [teks]` atau `.brat -a [teks]`\n" +
            "• Pilihan Tema: `.brat white [teks]`, `.brat black [teks]`, `.brat pink [teks]`, `.brat #8ace00 [teks]`\n\n" +
            "_Contoh:_ `.brat kamu nanya` atau `.bratvid inel kuping cabul`"
    }, { quoted: msg });
    return;
  }

  try {
    if (isAnimated) {
      await handleAnimatedBrat({ sock, msg, from, text, theme });
    } else {
      await handleStaticBrat({ sock, msg, from, text, theme });
    }
  } catch (err) {
    console.error("❌ Brat Error:", err);
    await sock.sendMessage(from, { text: `❌ Gagal membuat stiker brat: ${err.message}` }, { quoted: msg });
  }
};

/**
 * Handle Stiker Brat Statis dengan efek blur khas Charli XCX
 */
async function handleStaticBrat({ sock, msg, from, text, theme }) {
  const size = 512;
  const pngBuffer = renderBratCanvas(text, size, size, theme.bg, theme.text);

  // Berikan efek blur / difusi tipis otentik khas album Brat Charli XCX
  const blurredWebp = await sharp(pngBuffer)
    .blur(0.8)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 95 })
    .toBuffer();

  const stickerBuffer = await addExifToWebpBuffer(blurredWebp);
  await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
}

/**
 * Handle Stiker Brat Animasi (Typing / Kata demi Kata)
 */
async function handleAnimatedBrat({ sock, msg, from, text, theme }) {
  const words = text.split(/\s+/).filter(Boolean);
  const size = 512;

  // Buat frame per kata (akumulatif kata demi kata seperti animasi viral Brat)
  const frames = [];
  let currentWords = [];
  for (let i = 0; i < words.length; i++) {
    currentWords.push(words[i]);
    const frameText = currentWords.join(" ");
    frames.push(renderBratCanvas(frameText, size, size, theme.bg, theme.text));
  }

  // Tambahkan frame akhir beberapa kali agar animasi berhenti sejenak sebelum mengulang (loop)
  const lastFrame = frames[frames.length - 1];
  for (let i = 0; i < 3; i++) {
    frames.push(lastFrame);
  }

  // Simpan frame ke folder temp dan gabungkan dengan FFmpeg menjadi Animated WebP
  const tempDir = path.join(os.tmpdir(), "brat-" + Date.now());
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const outputFile = path.join(tempDir, "output.webp");

  try {
    for (let i = 0; i < frames.length; i++) {
      const framePath = path.join(tempDir, `frame_${String(i).padStart(3, "0")}.png`);
      // Simpan frame dengan efek blur khas
      const blurredPng = await sharp(frames[i]).blur(0.8).png().toBuffer();
      fs.writeFileSync(framePath, blurredPng);
    }

    // Hitung framerate (fps ideal 2-4 tergantung jumlah kata)
    const fps = Math.min(Math.max(Math.round(frames.length / 2), 2), 6);

    await runCmd("ffmpeg", [
      "-y",
      "-framerate", String(fps),
      "-i", path.join(tempDir, "frame_%03d.png"),
      "-vf", "scale=512:512:flags=lanczos,fps=12",
      "-c:v", "libwebp",
      "-lossless", "0",
      "-q:v", "65",
      "-loop", "0",
      "-an",
      outputFile
    ]);

    const rawWebp = fs.readFileSync(outputFile);
    const stickerBuffer = await addExifToWebpBuffer(rawWebp);
    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
  } finally {
    // Cleanup temporary files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

/**
 * Render canvas teks Brat dengan auto-fit typography
 */
function renderBratCanvas(text, width = 512, height = 512, bgColor = "#8ACE00", textColor = "#000000") {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  if (!text) return canvas.toBuffer("image/png");

  // Hitung ukuran font dinamis agar teks pas dan proporsional
  let fontSize = 76;
  const paddingH = 44;
  const paddingV = 44;
  const maxW = width - paddingH * 2;
  const maxH = height - paddingV * 2;

  let lines = [];
  while (fontSize >= 26) {
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    lines = wrapText(ctx, text, maxW);
    const totalH = lines.length * (fontSize * 1.18);
    if (totalH <= maxH) break;
    fontSize -= 4;
  }

  const lineHeight = Math.round(fontSize * 1.18);
  const totalTextH = lines.length * lineHeight;
  let startY = Math.round((height - totalTextH) / 2) + Math.round(fontSize * 0.88);

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  for (const line of lines) {
    ctx.fillText(line, width / 2, startY);
    startY += lineHeight;
  }

  return canvas.toBuffer("image/png");
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || "").split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function isColorLight(color) {
  let hex = color.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150;
}
