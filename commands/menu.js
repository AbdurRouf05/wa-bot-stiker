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
 ⊳ .yt <url> (YouTube)
 ⊳ .tt <url> (TikTok)
 ⊳ .ig <url> (Instagram)

*🎨 MEDIA & STICKER*
 ⊳ .s (Buat sticker)
 ⊳ .smeme (Sticker meme)
 ⊳ .toimg (Sticker ke gambar)
 ⊳ .tomp4 (Sticker ke video)
 ⊳ .qc (Quote sticker)
 ⊳ .remini (Enhance gambar)

*👥 GROUP TOOLS*
 ⊳ .hidetag (Mention all)
 ⊳ .delete (Hapus pesan bot)

*⚔️ RPG & GAMES*
 ⊳ .profile (Cek status RPG)
 ⊳ .leaderboard (Top XP)
 ⊳ .tebakkata (Tebak kata)
 ⊳ .ttt @tag (Tic-Tac-Toe)

*🎭 FUN & UTILITY*
 ⊳ .brat (Brat meme)
 ⊳ .math (Kalkulator)

╭━━━━━━━━━━━━━━━━━━━
┃ ⚡ _Powered by Baileys_
┃ 📌 _Ketik command untuk mulai!_
╰━━━━━━━━━━━━━━━━━━━
  `.trim();

  await sock.sendMessage(from, { text }, { quoted: msg });
};