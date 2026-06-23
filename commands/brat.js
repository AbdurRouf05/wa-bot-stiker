// commands/brat.js
// Buat stiker teks gaya album cover "brat" Charli XCX
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ==== coba load @napi-rs/canvas (buat gambar) ====
let createCanvas;
try {
  ({ createCanvas } = require("@napi-rs/canvas"));
} catch (e) {
  createCanvas = null;
  console.log(
    "[brat] module '@napi-rs/canvas' tidak tersedia, fitur .brat akan dimatikan di environment ini."
  );
}

// ==== coba load sharp (convert PNG -> WebP) ====
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
  console.log(
    "[brat] module 'sharp' tidak tersedia, fitur .brat akan dimatikan di environment ini."
  );
}

export default async ({ sock, msg, from, args }) => {
  // Kalau salah satu tidak ada, jangan crash
  if (!createCanvas || !sharp) {
    await sock.sendMessage(
      from,
      {
        text:
          "Fitur *.brat* belum tersedia di environment ini.\n" +
          "Diperlukan module *@napi-rs/canvas* dan *sharp*.",
      },
      { quoted: msg }
    );
    return;
  }

  const text = args.join(" ");
  if (!text) {
    await sock.sendMessage(
      from,
      { text: "Contoh: *.brat Inel kuping cabul*" },
      { quoted: msg }
    );
    return;
  }

  const size = 512;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // ===== Background hijau lime khas Brat =====
  ctx.fillStyle = "#8ACE00";
  ctx.fillRect(0, 0, size, size);

  // ===== Teks hitam semi-bold, sedikit blur =====
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Tentukan ukuran font yang pas berdasarkan panjang teks
  let fontSize = 80;
  if (text.length > 30) fontSize = 64;
  if (text.length > 60) fontSize = 52;
  if (text.length > 100) fontSize = 40;

  ctx.font = `bold italic ${fontSize}px Arial, "Helvetica Neue", sans-serif`;

  // Word wrap
  const words = text.split(/\s+/);
  const lineHeight = fontSize * 1.2;
  const maxWidth = size - 80;
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? line + " " + w : w;
    const width = ctx.measureText(test).width;
    if (width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  // Hitung posisi Y agar teks di tengah vertikal
  const totalHeight = lines.length * lineHeight;
  let startY = (size - totalHeight) / 2 + lineHeight / 2;

  // Efek blur: gambar teks beberapa kali dengan offset kecil dan opacity rendah
  // untuk menciptakan efek blur khas Brat
  const blurLayers = [
    { offsetX: -2, offsetY: -1, alpha: 0.15 },
    { offsetX: 2, offsetY: 1, alpha: 0.15 },
    { offsetX: -1, offsetY: 2, alpha: 0.12 },
    { offsetX: 1, offsetY: -2, alpha: 0.12 },
    { offsetX: -3, offsetY: 0, alpha: 0.08 },
    { offsetX: 3, offsetY: 0, alpha: 0.08 },
    { offsetX: 0, offsetY: -3, alpha: 0.08 },
    { offsetX: 0, offsetY: 3, alpha: 0.08 },
  ];

  for (const layer of blurLayers) {
    ctx.globalAlpha = layer.alpha;
    let y = startY;
    for (const l of lines) {
      ctx.fillText(l, size / 2 + layer.offsetX, y + layer.offsetY);
      y += lineHeight;
    }
  }

  // Gambar teks utama
  ctx.globalAlpha = 0.85;
  let y = startY;
  for (const l of lines) {
    ctx.fillText(l, size / 2, y);
    y += lineHeight;
  }

  ctx.globalAlpha = 1.0;

  const pngBuf = canvas.toBuffer("image/png");
  const webpBuf = await sharp(pngBuf).webp({ quality: 95 }).toBuffer();

  await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
};
