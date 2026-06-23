// commands/brat.js
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

  // background putih
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#000000";
  ctx.font = 'bold 64px "Segoe UI Emoji", "Noto Color Emoji", Sans';
  ctx.textAlign = "left";

  const words = text.split(/\s+/);
  const lineHeight = 70;
  let x = 40;
  let y = 120;
  let line = "";

  for (const w of words) {
    const test = line ? line + " " + w : w;
    const width = ctx.measureText(test).width;
    if (width > size - 80 && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);

  const pngBuf = canvas.toBuffer("image/png");
  const webpBuf = await sharp(pngBuf).webp({ quality: 95 }).toBuffer();

  await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
};
