// commands/yt.js - YouTube Downloader (Primary: youtubei.js, Fallback: RapidAPI YTStream)
import fetch from 'node-fetch';
import { Innertube, Platform } from 'youtubei.js';

// Provide the custom JavaScript evaluator for youtubei.js
Platform.shim.eval = async (data) => {
  return new Function(data.output)();
};

let ytClient = null;

async function getYTClient() {
  if (!ytClient) {
    ytClient = await Innertube.create();
  }
  return ytClient;
}

/**
 * Helper untuk ambil YouTube ID dari URL
 */
function getYoutubeId(url) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const cleanUrl = url.replace(/^(https?:\/\/)?(www\.|m\.)/, '');
  const match = cleanUrl.match(regex);
  return match ? match[1] : null;
}

export default async ({ sock, from, msg, args }) => {
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

    let videoBuffer;
    let title = 'YouTube Video';
    let methodUsed = 'Local AI/Decipher';

    // ==========================================
    // METODE 1: youtubei.js (Primary & Gratis)
    // ==========================================
    try {
      console.log(`[YT] Mencoba download video ${videoId} dengan youtubei.js...`);
      const yt = await getYTClient();
      const video = await yt.getInfo(videoId);
      title = video.basic_info.title || 'YouTube Video';

      const stream = await video.download({
        type: 'video+audio',
        quality: '360p',
        format: 'mp4'
      });

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      videoBuffer = Buffer.concat(chunks);
      console.log(`[YT] Berhasil mendownload via youtubei.js. Size: ${videoBuffer.length} bytes`);

    } catch (ytError) {
      console.error('[YT] Metode youtubei.js gagal, beralih ke Fallback API:', ytError.message);
      
      // ==========================================
      // METODE 2: RapidAPI YTStream (Fallback)
      // ==========================================
      methodUsed = 'RapidAPI YTStream';
      const apiUrl = `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`;
      const options = {
        method: 'GET',
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY || 'c60a569d9bmshc8784a5743699a0p10423cjsn8b083ea602a2',
          'x-rapidapi-host': 'ytstream-download-youtube-videos.p.rapidapi.com'
        }
      };

      console.log('[YT] Mengambil data dari API YTStream...');
      const response = await fetch(apiUrl, options);
      const data = await response.json();

      if (data.status !== 'OK' && !data.link && (!data.formats || data.formats.length === 0)) {
         throw new Error(data.error || data.msg || 'Gagal mendapatkan link download dari API.');
      }

      let videoUrl = data.link;
      title = data.title || title;

      if (!videoUrl && data.formats && data.formats.length > 0) {
          const bestFormat = data.formats.find(f => f.qualityLabel && f.url);
          if (bestFormat) videoUrl = bestFormat.url;
      }

      if (!videoUrl) {
          throw new Error('Tidak bisa menemukan URL video yang valid dalam response.');
      }

      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
          throw new Error(`Gagal mendownload file video: HTTP ${videoResponse.status}`);
      }

      videoBuffer = await videoResponse.buffer();
      console.log(`[YT] Berhasil mendownload via RapidAPI. Size: ${videoBuffer.length} bytes`);
    }

    const fileSize = videoBuffer.length;
    if (fileSize > 100 * 1024 * 1024) {
      await sock.sendMessage(
        from,
        { text: `❌ Video terlalu besar! (${(fileSize / (1024*1024)).toFixed(1)}MB). Maksimal 100MB.` }
      );
      return;
    }

    const caption = `✅ *YouTube Download Selesai!*\n📌 *Judul:* ${title}\n👤 *ID:* ${videoId}\n⚙️ *Engine:* ${methodUsed}`;

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
    console.error('YouTube Final Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal download YouTube!* \nError: ${error.message}\n\n💡 *Cek:*\n• Pastikan link video benar\n• Coba lagi beberapa saat lagi` 
      },
      { quoted: msg }
    );
  }
};