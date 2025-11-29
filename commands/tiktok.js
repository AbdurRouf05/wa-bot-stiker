// commands/tiktok.js - TikTok Downloader
const fetch = require('node-fetch');
const fs = require('fs');

module.exports = async ({ sock, msg, from, args }) => {
  if (args.length === 0) {
    return await sock.sendMessage(
      from,
      { 
        text: "❌ *Cara penggunaan:*\n.tt [url_tiktok]\nContoh: .tt https://vt.tiktok.com/..." 
      },
      { quoted: msg }
    );
  }

  const url = args[0];
  
  // Validasi URL TikTok
  if (!url.includes('tiktok.com')) {
    return await sock.sendMessage(
      from,
      { text: "❌ URL TikTok tidak valid!" },
      { quoted: msg }
    );
  }

  try {
    await sock.sendMessage(
      from,
      { text: "⏳ *Mendownload video TikTok...*" },
      { quoted: msg }
    );

    // API 1: TikWM (fix URL concatenation)
    const apiUrl = `https://tikwm.com/api?url=${encodeURIComponent(url)}`;
    console.log('Menggunakan API:', apiUrl);
    
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.data && data.data.play) {
      // FIX: Pastikan URL lengkap dan benar
      let videoUrl = data.data.play;
      if (!videoUrl.startsWith('http')) {
        videoUrl = `https://tikwm.com${videoUrl}`;
      }
      
      const title = data.data.title || 'Video TikTok';
      const author = data.data.author?.nickname || 'Unknown';

      await sock.sendMessage(
        from,
        { text: `📥 *Video ditemukan!*\n👤 ${author}\n⏳ Mendownload...` },
        { quoted: msg }
      );

      console.log('Download dari:', videoUrl);
      const videoResponse = await fetch(videoUrl);
      
      if (!videoResponse.ok) {
        throw new Error(`HTTP ${videoResponse.status}: ${videoResponse.statusText}`);
      }

      const videoBuffer = await videoResponse.buffer();
      await sendVideo(sock, from, videoBuffer, title, author);
      return;
    }

    // API 2: Alternatif jika API 1 gagal
    await sock.sendMessage(
      from,
      { text: "🔄 Mencoba API alternatif..." },
      { quoted: msg }
    );

    const altApiUrl = `https://www.tiklydown.com/api/download?url=${encodeURIComponent(url)}`;
    const altResponse = await fetch(altApiUrl);
    const altData = await altResponse.json();
    
    if (altData.videoUrl) {
      const videoResponse = await fetch(altData.videoUrl);
      const videoBuffer = await videoResponse.buffer();
      
      await sendVideo(sock, from, videoBuffer, altData.title || 'Video TikTok', altData.author || 'Unknown');
      return;
    }

    // Jika semua API gagal
    throw new Error('Semua API gagal');

  } catch (error) {
    console.error('TikTok Download Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal download TikTok!*\nError: ${error.message}\n\nCoba link lain atau coba lagi nanti.` 
      },
      { quoted: msg }
    );
  }
};

// Helper function untuk mengirim video
async function sendVideo(sock, from, videoBuffer, title, author) {
  const fileSize = videoBuffer.length;

  if (fileSize > 90 * 1024 * 1024) {
    await sock.sendMessage(
      from,
      { text: `❌ Video terlalu besar! (${(fileSize / (1024*1024)).toFixed(1)}MB)` }
    );
    return;
  }

  const caption = `✅ *TikTok Download*\n🎵 ${title}\n👤 ${author}`;

  if (fileSize < 16 * 1024 * 1024) {
    await sock.sendMessage(
      from,
      { 
        video: videoBuffer,
        caption: caption,
        fileName: `tiktok_${Date.now()}.mp4`
      }
    );
  } else {
    await sock.sendMessage(
      from,
      { 
        document: videoBuffer,
        caption: caption + '\n📁 Dikirim sebagai document',
        fileName: `tiktok_${Date.now()}.mp4`,
        mimetype: 'video/mp4'
      }
    );
  }
}