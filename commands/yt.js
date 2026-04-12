// commands/yt.js - YouTube Downloader (Updated to YTStream API)
const fetch = require('node-fetch');

module.exports = async ({ sock, msg, from, args }) => {
  if (args.length === 0) {
    return await sock.sendMessage(
      from,
      { 
        text: "❌ *Cara penggunaan:*\n.yt [url_youtube]\nContoh: .yt https://youtu.be/..." 
      },
      { quoted: msg }
    );
  }

  const url = args[0];
  const videoId = getYoutubeId(url);

  if (!videoId) {
    return await sock.sendMessage(
      from,
      { text: "❌ URL YouTube tidak valid! Mohon masukkan link video yang benar." },
      { quoted: msg }
    );
  }

  try {
    await sock.sendMessage(
      from,
      { text: "⏳ *Mendownload video YouTube...*\nMohon tunggu..." },
      { quoted: msg }
    );

    // API YTStream (Berdasarkan screenshot pengguna)
    const apiUrl = `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`;
    const options = {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'ytstream-download-youtube-videos.p.rapidapi.com'
      }
    };

    console.log('Mengambil data dari API YTStream...');
    const response = await fetch(apiUrl, options);
    const data = await response.json();

    if (data.status !== 'OK' && !data.link && (!data.formats || data.formats.length === 0)) {
       throw new Error(data.msg || 'Gagal mendapatkan link download dari API.');
    }

    // Ambil link download (mendukung format .link atau .formats)
    // Biasanya YTStream memberikan format terbaik di .link atau list di .formats
    let videoUrl = data.link;
    const title = data.title || 'YouTube Video';

    if (!videoUrl && data.formats && data.formats.length > 0) {
        // Cari format video + audio (mp4)
        const bestFormat = data.formats.find(f => f.qualityLabel && f.url);
        if (bestFormat) videoUrl = bestFormat.url;
    }

    if (!videoUrl) {
        throw new Error('Tidak bisa menemukan URL video yang valid dalam response.');
    }

    // Download video buffer
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
        throw new Error(`Gagal mendownload file video: HTTP ${videoResponse.status}`);
    }

    const videoBuffer = await videoResponse.buffer();
    const fileSize = videoBuffer.length;

    if (fileSize > 100 * 1024 * 1024) {
      await sock.sendMessage(
        from,
        { text: `❌ Video terlalu besar! (${(fileSize / (1024*1024)).toFixed(1)}MB). Maksimal 100MB.` }
      );
      return;
    }

    const caption = `✅ *YouTube Download Selesai!*\n📌 *Judul:* ${title}\n👤 *ID:* ${videoId}`;

    // Kirim video
    if (fileSize < 16 * 1024 * 1024) {
      await sock.sendMessage(
        from,
        { 
          video: videoBuffer,
          caption: caption,
          fileName: `${videoId}.mp4`
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        from,
        { 
          document: videoBuffer,
          caption: caption + '\n📁 Dikirim sebagai document',
          fileName: `${videoId}.mp4`,
          mimetype: 'video/mp4'
        },
        { quoted: msg }
      );
    }

  } catch (error) {
    console.error('YouTube Fix Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal download YouTube!* \nError: ${error.message}\n\n💡 *Cek:*\n• Pastikan link video benar\n• Coba lagi beberapa saat lagi` 
      },
      { quoted: msg }
    );
  }
};

/**
 * Helper untuk ambil YouTube ID dari URL
 */
function getYoutubeId(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}