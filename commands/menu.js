// commands/menu.js
module.exports = async ({ sock, from, msg }) => {
  const text = `
🎬 *BOT DOWNLOADER*

📥 *DOWNLOAD*
• .yt [url] - Download YouTube
• .tt [url] - Download TikTok  
• .ig [url] - Download Instagram

🛠️ *MEDIA TOOLS*
• .s - Buat sticker
• .toimg - Sticker ke gambar
• .tomp4 - Sticker ke video
• .qc - Quote sticker
• .remini - Enhance gambar

👥 *GROUP*
• .hidetag - Mention all
• .delete - Delete pesan bot

🎭 *FUN*
• .brat - Brat meme

⚡ _Simple & Fast_
  `.trim();

  await sock.sendMessage(from, { text }, { quoted: msg });
};