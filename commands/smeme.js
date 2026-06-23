// commands/smeme.js
// Meme Maker — Tambahkan teks di atas/bawah gambar lalu jadikan stiker
import { createRequire } from "module";
import { addExifToWebpBuffer } from "../utils/exif.js";

const require = createRequire(import.meta.url);

let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = require("@napi-rs/canvas"));
} catch (e) {
  createCanvas = null;
}

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
}

export default async ({ sock, msg, from, args, getMediaBuffer }) => {
  if (!createCanvas || !sharp) {
    await sock.sendMessage(
      from,
      { text: "Fitur *.smeme* belum tersedia. Perlu @napi-rs/canvas dan sharp." },
      { quoted: msg }
    );
    return;
  }

  const text = args.join(" ");
  if (!text) {
    await sock.sendMessage(
      from,
      { text: "Contoh penggunaan:\nReply/kirim gambar dengan caption: *.smeme teks atas | teks bawah*\nAtau: *.smeme teks saja*" },
      { quoted: msg }
    );
    return;
  }

  // Pisahkan top dan bottom text (dipisah dengan |)
  let topText = text;
  let bottomText = "";
  if (text.includes("|")) {
    const parts = text.split("|");
    topText = parts[0].trim();
    bottomText = parts.slice(1).join("|").trim();
  } else {
    // Kalau tidak ada |, asumsikan teks ditaruh di bawah semua
    topText = "";
    bottomText = text;
  }

  const media = await getMediaBuffer(msg);
  if (!media) {
    await sock.sendMessage(
      from,
      { text: "Reply atau kirim gambar dengan caption *.smeme teks*" },
      { quoted: msg }
    );
    return;
  }

  if (media.type !== "imageMessage") {
    await sock.sendMessage(
      from,
      { text: "❌ Saat ini fitur *.smeme* hanya mendukung gambar, belum mendukung video/GIF." },
      { quoted: msg }
    );
    return;
  }

  try {
    // Load image via napi-rs
    const img = await loadImage(media.buffer);
    
    // Resize agar pas jadi stiker (maks 512x512, pertahankan aspect ratio)
    const MAX_SIZE = 512;
    let width = img.width;
    let height = img.height;
    
    if (width > height) {
      if (width > MAX_SIZE) {
        height = Math.round(height * (MAX_SIZE / width));
        width = MAX_SIZE;
      }
    } else {
      if (height > MAX_SIZE) {
        width = Math.round(width * (MAX_SIZE / height));
        height = MAX_SIZE;
      }
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Gambar background image
    ctx.drawImage(img, 0, 0, width, height);

    // Fungsi helper untuk menggambar teks meme (putih dengan stroke hitam)
    const drawMemeText = (txt, x, y, align = "center", baseline = "top") => {
      if (!txt) return;
      
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      
      // Kalkulasi ukuran font proporsional (max 1/8 tinggi, minimal 20px)
      let fontSize = Math.max(20, Math.floor(height / 8));
      ctx.font = `bold ${fontSize}px Impact, "Segoe UI Black", Arial, sans-serif`;
      
      // Pengecilan font jika teks terlalu lebar
      while (ctx.measureText(txt).width > width - 20 && fontSize > 14) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px Impact, "Segoe UI Black", Arial, sans-serif`;
      }

      ctx.fillStyle = "white";
      ctx.strokeStyle = "black";
      ctx.lineWidth = fontSize / 10;
      ctx.lineJoin = "round";

      ctx.strokeText(txt, x, y);
      ctx.fillText(txt, x, y);
    };

    // Gambar teks atas
    if (topText) {
      drawMemeText(topText.toUpperCase(), width / 2, 10, "center", "top");
    }

    // Gambar teks bawah
    if (bottomText) {
      drawMemeText(bottomText.toUpperCase(), width / 2, height - 10, "center", "bottom");
    }

    // Convert ke WebP stiker
    const pngBuf = canvas.toBuffer("image/png");
    const webpBuf = await sharp(pngBuf)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer();

    const finalSticker = addExifToWebpBuffer(webpBuf);

    await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
  } catch (err) {
    console.error("Smeme error:", err);
    await sock.sendMessage(from, { text: "❌ Gagal memproses gambar." }, { quoted: msg });
  }
};
