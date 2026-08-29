// commands/brat.js — Generator stiker Brat (Charli XCX album aesthetic)
// Default: background PUTIH, teks HITAM, blur tipis
import { createRequire } from "module";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { addExifToWebpBuffer } from "../utils/exif.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let createCanvas, GlobalFonts;
try {
  ({ createCanvas, GlobalFonts } = require("@napi-rs/canvas"));
  if (GlobalFonts) {
    const fontsDir = path.join(__dirname, "..", "assets", "fonts");
    for (const [file, family] of [
      ["Noto-Regular.ttf", "NotoSans"],
      ["Noto-Bold.ttf", "NotoSansBold"],
      ["Noto-Emoji.ttf", "NotoEmoji"],
    ]) {
      const p = path.join(fontsDir, file);
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family);
    }
  }
} catch { createCanvas = null; }

let sharp;
try { sharp = require("sharp"); } catch { sharp = null; }

// Warna-warna preset
const COLORS = {
  white:  { bg: "#ffffff", text: "#000000" },  // DEFAULT — classic brat
  black:  { bg: "#000000", text: "#ffffff" },
  lime:   { bg: "#8ACE00", text: "#000000" },
  green:  { bg: "#8ACE00", text: "#000000" },
  pink:   { bg: "#ff5da2", text: "#000000" },
  cyan:   { bg: "#00f0ff", text: "#000000" },
  yellow: { bg: "#ffe600", text: "#000000" },
  red:    { bg: "#ff1e42", text: "#ffffff" },
};

const FONT = '"NotoSans", "NotoSansBold", "NotoEmoji", Arial, "Helvetica Neue", sans-serif';

function isLight(hex) {
  let h = (hex||"").replace("#","");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.substr(0,2),16)||0, g = parseInt(h.substr(2,2),16)||0, b = parseInt(h.substr(4,2),16)||0;
  return (r*299+g*587+b*114)/1000 > 150;
}

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 35000 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

// Cari contextInfo dari reply apapun
function getContextInfo(msg) {
  const m = msg.message || {};
  for (const key of Object.keys(m)) {
    if (m[key]?.contextInfo?.quotedMessage) return m[key].contextInfo;
  }
  return null;
}

export default async (ctx) => {
  const { sock, msg, from, args, cmd } = ctx;

  if (!createCanvas || !sharp) {
    return sock.sendMessage(from, { text: "⚠️ Fitur .brat memerlukan @napi-rs/canvas dan sharp." }, { quoted: msg });
  }

  // Deteksi mode animasi
  let isAnim = cmd === "bratvid" || cmd === "bratgif";
  let rawArgs = [...args];
  if (rawArgs[0] === "-a" || rawArgs[0] === "-v" || rawArgs[0] === "anim") {
    isAnim = true;
    rawArgs = rawArgs.slice(1);
  }

  // Parse warna
  let theme = COLORS.white; // DEFAULT: putih hitam
  if (rawArgs.length > 0) {
    const first = rawArgs[0].toLowerCase();
    if (COLORS[first]) {
      theme = COLORS[first];
      rawArgs = rawArgs.slice(1);
    } else if (/^#[0-9a-f]{3,6}$/i.test(first)) {
      theme = { bg: first, text: isLight(first) ? "#000" : "#fff" };
      rawArgs = rawArgs.slice(1);
    }
  }

  let text = rawArgs.join(" ").trim();

  // Jika kosong, cek reply
  if (!text) {
    const ci = getContextInfo(msg);
    if (ci) {
      const qMsg = ci.quotedMessage || {};
      text = qMsg.conversation ||
        qMsg.extendedTextMessage?.text ||
        qMsg.imageMessage?.caption ||
        qMsg.videoMessage?.caption || "";
    }
  }

  if (!text) {
    return sock.sendMessage(from, {
      text: "🎨 *Brat Sticker*\n\n" +
        "• `.brat [teks]` — stiker statis\n" +
        "• `.bratvid [teks]` — stiker animasi (kata per kata)\n" +
        "• Reply pesan lalu `.brat` atau `.bratvid`\n" +
        "• Warna: `.brat black`, `.brat lime`, `.brat pink`, `.brat #hex`\n\n" +
        "_Contoh: .brat kamu nanya_"
    }, { quoted: msg });
  }

  try {
    if (isAnim) {
      await doAnimBrat({ sock, msg, from, text, theme });
    } else {
      await doStaticBrat({ sock, msg, from, text, theme });
    }
  } catch (err) {
    console.error("❌ Brat Error:", err);
    await sock.sendMessage(from, { text: `❌ Brat gagal: ${err.message}` }, { quoted: msg });
  }
};

async function doStaticBrat({ sock, msg, from, text, theme }) {
  const png = renderBrat(text, 512, 512, theme.bg, theme.text);
  const webp = await sharp(png)
    .blur(0.8)
    .resize(512, 512, { fit: "contain", background: { r:0,g:0,b:0, alpha:0 } })
    .webp({ quality: 95 })
    .toBuffer();
  const sticker = await addExifToWebpBuffer(webp);
  await sock.sendMessage(from, { sticker }, { quoted: msg });
}

async function doAnimBrat({ sock, msg, from, text, theme }) {
  const words = text.split(/\s+/).filter(Boolean);
  const size = 512;
  const frames = [];
  let acc = [];
  for (const w of words) {
    acc.push(w);
    frames.push(renderBrat(acc.join(" "), size, size, theme.bg, theme.text));
  }
  // Hold frame terakhir
  for (let i = 0; i < 3; i++) frames.push(frames[frames.length-1]);

  const tmpDir = path.join(os.tmpdir(), "brat-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const outFile = path.join(tmpDir, "out.webp");

  try {
    for (let i = 0; i < frames.length; i++) {
      const blurred = await sharp(frames[i]).blur(0.8).png().toBuffer();
      fs.writeFileSync(path.join(tmpDir, `frame_${String(i).padStart(3,"0")}.png`), blurred);
    }
    const fps = Math.min(Math.max(Math.round(frames.length / 2), 2), 6);
    await runCmd("ffmpeg", [
      "-y", "-framerate", String(fps),
      "-i", path.join(tmpDir, "frame_%03d.png"),
      "-vf", "scale=512:512:flags=lanczos,fps=12",
      "-c:v", "libwebp", "-lossless", "0", "-q:v", "65", "-loop", "0", "-an",
      outFile
    ]);
    const rawWebp = fs.readFileSync(outFile);
    const sticker = await addExifToWebpBuffer(rawWebp);
    await sock.sendMessage(from, { sticker }, { quoted: msg });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function renderBrat(text, w = 512, h = 512, bg = "#ffffff", fg = "#000000") {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (!text) return canvas.toBuffer("image/png");

  let fontSize = 76;
  const padH = 44, padV = 44;
  const maxW = w - padH*2, maxH = h - padV*2;
  let lines = [];
  while (fontSize >= 26) {
    ctx.font = `bold ${fontSize}px ${FONT}`;
    lines = wrap(ctx, text, maxW);
    if (lines.length * fontSize * 1.18 <= maxH) break;
    fontSize -= 4;
  }
  const lh = Math.round(fontSize * 1.18);
  const totalH = lines.length * lh;
  let y = Math.round((h - totalH) / 2) + Math.round(fontSize * 0.88);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const line of lines) {
    ctx.fillText(line, w/2, y);
    y += lh;
  }
  return canvas.toBuffer("image/png");
}

function wrap(ctx, text, maxW) {
  const words = (text||"").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
