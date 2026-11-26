// commands/menu.js
export default async ({ sock, from, msg }) => {
  const pushName = msg.pushName || "Kak";
  const botName = "🤖 ABD BOT";

  const text = `
╭━━━〔 *${botName}* 〕━━━
┃ 👋 Halo, *${pushName}*!
┃ Selamat datang di menu utama.
╰━━━━━━━━━━━━━━━━━━━

*📦 BUNDLE DOWNLOADER*
 ⊳ .spotify <judul> (Cari & kirim lagu)
 ⊳ .yt <url> (YouTube)
 ⊳ .tt <url> (TikTok)
 ⊳ .ig <url> (Instagram)
 ⊳ .pin <url> (Pinterest)

*🎨 MEDIA & STICKER*
 ⊳ .s (Foto/video → sticker, bisa sekali lihat)
 ⊳ .ss (Video → sticker bersuara 🔊)
 ⊳ .smeme (Sticker meme)
 ⊳ .toimg (Sticker ke gambar)
 ⊳ .tomp4 (Sticker ke video)
 ⊳ .qc (Quote sticker WA)
 ⊳ .brat (Brat sticker)
 ⊳ .bratvid (Brat animasi)
 ⊳ .remini (Enhance gambar)

*📄 DOKUMEN & QR*
 ⊳ .qr <teks/link> (Buat kode QR)
 ⊳ .topdf (Word/Excel/PPT/foto/teks → PDF)
 ⊳ .todocx (PDF → Word)

*👥 GROUP TOOLS*
 ⊳ .hidetag (Mention all)
 ⊳ .delete (Hapus pesan bot)

*⚔️ RPG & GAMES*
 ⊳ .profile (Cek status RPG)
 ⊳ .leaderboard (Top XP)
 ⊳ .ttt @tag (Tic-Tac-Toe)

*🎭 FUN & UTILITY*
 ⊳ .math (Kalkulator)
 ⊳ .cekwa <nomor> (Info publik nomor WA)

╭━━━━━━━━━━━━━━━━━━━
┃
┃ 📌 _Ketik command untuk mulai!_
╰━━━━━━━━━━━━━━━━━━━
  `.trim();

  await sock.sendMessage(from, { text }, { quoted: msg });
};