// commands/brat.js
const { createCanvas } = require("canvas");
const sharp = require("sharp");

module.exports = async ({ sock, msg, from, args }) => {
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
  ctx.font = "bold 64px Sans";
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
