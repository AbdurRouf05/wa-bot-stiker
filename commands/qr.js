// commands/qr.js — .qr <teks/link/apa saja> → gambar kode QR
import QRCode from "qrcode";
import { getContextInfo, getMessageText } from "../utils.js";

export const aliases = ["qrcode", "buatqr"];

const MAX_CHARS = 2000; // batas aman agar QR masih bisa di-scan HP

export default async ({ sock, msg, from, text }) => {
  // Ambil teks mentah setelah ".qr" supaya baris baru tetap utuh
  let data = (text || "").replace(/^\S+\s?/, "").trim();

  // Reply pesan teks → pakai isi pesan itu
  if (!data) {
    const quoted = getContextInfo(msg.message)?.quotedMessage;
    if (quoted) data = getMessageText(quoted).trim();
  }

  if (!data) {
    await sock.sendMessage(
      from,
      { text: "🔳 *Generate Kode QR*\n\nContoh:\n• *.qr https://google.com*\n• *.qr WIFI:T:WPA;S:NamaWifi;P:password;;*\n• Reply pesan teks dengan *.qr*" },
      { quoted: msg }
    );
    return;
  }

  if (data.length > MAX_CHARS) {
    await sock.sendMessage(from, { text: `⚠️ Teks terlalu panjang (${data.length} karakter). Maksimal ${MAX_CHARS}.` }, { quoted: msg });
    return;
  }

  try {
    const image = await QRCode.toBuffer(data, {
      type: "png",
      width: 768,
      margin: 2,
      errorCorrectionLevel: data.length > 800 ? "L" : "M",
    });
    const preview = data.length > 100 ? data.slice(0, 100) + "…" : data;
    await sock.sendMessage(from, { image, caption: `✅ Kode QR\n📝 ${preview}` }, { quoted: msg });
  } catch (err) {
    console.error("❌ QR error:", err.message);
    await sock.sendMessage(from, { text: "❌ Gagal membuat kode QR." }, { quoted: msg });
  }
};
