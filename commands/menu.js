// commands/menu.js
export default async ({ sock, from, msg }) => {
  const text = `
🎬 *BOT DOWNLOADER*

📥 *DOWNLOAD*
• .yt [url] - Download YouTube
• .tt [url] - Download TikTok  
• .ig [url] - Download Instagram

🛠️ *MEDIA TOOLS*
• .s - Buat sticker
• .smeme - Sticker meme (text on image)
• .toimg - Sticker ke gambar
• .tomp4 - Sticker ke video
• .qc - Quote sticker
• .remini - Enhance gambar

👥 *GROUP*
• .hidetag - Mention all
• .delete - Delete pesan bot

🎮 *GAMES*
• .tebakkata - Main tebak kata
• .ttt [@tag] - Main Tic-Tac-Toe

🎭 *FUN & UTILITY*
• .brat - Brat meme
• .math - Kalkulator pintar

⚡ _Simple & Fast_
  `.trim();

  await sock.sendMessage(from, { text }, { quoted: msg });
};