// commands/cekwa.js — .cekwa <nomor>: cek info PUBLIK sebuah nomor WhatsApp
// Hanya data yang memang ditampilkan WhatsApp ke siapa pun (sesuai pengaturan privasi pemiliknya):
// terdaftar/tidak, foto profil, info/about, dan profil bisnis. Tidak ada pelacakan.
import { getContextInfo } from "../utils.js";

export const aliases = ["cekno", "wainfo"];

function normalizeNumber(raw) {
  let n = String(raw || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1); // default Indonesia
  return n.length >= 8 && n.length <= 15 ? n : null;
}

const fmtDate = (d) =>
  d && d.getTime() > 0
    ? d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    : null;

export default async ({ sock, msg, from, args }) => {
  let number = normalizeNumber(args.join(""));
  if (!number) {
    // Reply pesan / mention seseorang → cek pengirimnya
    const ctx = getContextInfo(msg.message);
    const target = ctx?.mentionedJid?.[0] || ctx?.participant;
    if (target && target.endsWith("@s.whatsapp.net")) number = target.split("@")[0];
  }
  if (!number) {
    await sock.sendMessage(from, { text: "🔍 *Cek Nomor WhatsApp*\nContoh: *.cekwa 08123456789*\nAtau reply pesan seseorang dengan *.cekwa*" }, { quoted: msg });
    return;
  }

  await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });
  try {
    const [found] = (await sock.onWhatsApp(number)) || [];
    if (!found?.exists) {
      await sock.sendMessage(from, { text: `❌ +${number} *tidak terdaftar* di WhatsApp.` }, { quoted: msg });
      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      return;
    }
    const jid = found.jid;

    const [statusRes, pictureRes, bizRes] = await Promise.allSettled([
      sock.fetchStatus(jid),
      sock.profilePictureUrl(jid, "image"),
      sock.getBusinessProfile(jid),
    ]);

    const statusInfo = statusRes.status === "fulfilled" ? statusRes.value?.[0]?.status : null;
    const about = statusInfo?.status;
    const aboutAt = fmtDate(statusInfo?.setAt);
    const picture = pictureRes.status === "fulfilled" ? pictureRes.value : null;
    const biz = bizRes.status === "fulfilled" ? bizRes.value : null;

    let text = `📱 *Info Nomor WhatsApp*\n\n`;
    text += `• Nomor: +${number}\n`;
    text += `• Status: ✅ Terdaftar\n`;
    text += `• Jenis akun: ${biz ? "🏢 WhatsApp Business" : "👤 Pribadi"}\n`;
    text += `• Info/About: ${about ? `"${about}"` : "_disembunyikan / kosong_"}\n`;
    if (about && aboutAt) text += `• Info diubah: ${aboutAt}\n`;
    text += `• Foto profil: ${picture ? "ada" : "_disembunyikan / tidak ada_"}\n`;
    if (biz) {
      if (biz.description) text += `\n🏢 *Profil Bisnis*\n${biz.description}\n`;
      if (biz.category) text += `• Kategori: ${biz.category}\n`;
      if (biz.email) text += `• Email: ${biz.email}\n`;
      if (biz.website?.length) text += `• Website: ${biz.website.join(", ")}\n`;
      if (biz.address) text += `• Alamat: ${biz.address}\n`;
    }
    text += `\n_Hanya data publik sesuai pengaturan privasi pemilik nomor._`;

    if (picture) await sock.sendMessage(from, { image: { url: picture }, caption: text }, { quoted: msg });
    else await sock.sendMessage(from, { text }, { quoted: msg });
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
  } catch (err) {
    console.error("❌ cekwa error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
    await sock.sendMessage(from, { text: `❌ Gagal mengecek nomor.\n${err.message}` }, { quoted: msg });
  }
};
