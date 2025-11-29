// commands/yt.js - YouTube Downloader (Updated API)
const qs = require('querystring');
const http = require('https');

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

  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    return await sock.sendMessage(
      from,
      { text: "❌ URL YouTube tidak valid!" },
      { quoted: msg }
    );
  }

  try {
    await sock.sendMessage(
      from,
      { text: "⏳ *Mendownload video YouTube...*\nMohon tunggu..." },
      { quoted: msg }
    );

    // Konfigurasi API baru
    const options = {
      method: 'POST',
      hostname: 'youtube-video-downloader50.p.rapidapi.com',
      port: null,
      path: '/download.php',
      headers: {
        'x-rapidapi-key': 'c60a569d9bmshc8784a5743699a0p10423cjsn8b083ea602a2',
        'x-rapidapi-host': 'youtube-video-downloader50.p.rapidapi.com',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    // Kirim request ke API
    const req = http.request(options, function (res) {
      const chunks = [];

      res.on('data', function (chunk) {
        chunks.push(chunk);
      });

      res.on('end', function () {
        try {
          const body = Buffer.concat(chunks);
          const responseText = body.toString();
          
          console.log('Raw API Response:', responseText);

          // Parse response JSON
          let responseData;
          try {
            responseData = JSON.parse(responseText);
          } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            throw new Error('Format response API tidak valid');
          }

          // Proses response untuk mendapatkan URL video
          processVideoResponse(sock, from, msg, responseData);

        } catch (error) {
          console.error('Response Processing Error:', error);
          sock.sendMessage(
            from,
            { 
              text: `❌ *Error memproses response:*\n${error.message}` 
            },
            { quoted: msg }
          );
        }
      });
    });

    // Handle request errors
    req.on('error', function (error) {
      console.error('Request Error:', error);
      sock.sendMessage(
        from,
        { 
          text: `❌ *Error koneksi:*\n${error.message}` 
        },
        { quoted: msg }
      );
    });

    // Kirim data URL YouTube ke API
    const postData = qs.stringify({
      url: url
    });

    req.write(postData);
    req.end();

  } catch (error) {
    console.error('YouTube Download Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal memproses request:*\n${error.message}` 
      },
      { quoted: msg }
    );
  }
};

// Fungsi untuk memproses response video
async function processVideoResponse(sock, from, msg, responseData) {
  try {
    let videoUrl, videoTitle = 'YouTube Video';

    // Analisis struktur response yang mungkin
    if (responseData.download_url) {
      videoUrl = responseData.download_url;
    } else if (responseData.url) {
      videoUrl = responseData.url;
    } else if (responseData.video_url) {
      videoUrl = responseData.video_url;
    } else if (responseData.links && responseData.links.video) {
      videoUrl = responseData.links.video;
    } else if (responseData.formats && responseData.formats.length > 0) {
      // Jika API mengembalikan multiple format
      const videoFormat = responseData.formats.find(f => f.hasVideo && f.hasAudio);
      if (videoFormat && videoFormat.url) {
        videoUrl = videoFormat.url;
      }
    } else if (responseData.direct_url) {
      videoUrl = responseData.direct_url;
    }

    if (!videoUrl) {
      console.log('Struktur response:', JSON.stringify(responseData, null, 2));
      throw new Error('Tidak bisa menemukan URL video dalam response API');
    }

    await sock.sendMessage(
      from,
      { text: `📥 *Video ditemukan!*\n⏳ Sedang mendownload...` },
      { quoted: msg }
    );

    console.log('Download dari:', videoUrl);
    
    // Download video
    const videoResponse = await fetch(videoUrl);
    
    if (!videoResponse.ok) {
      throw new Error(`Gagal download video: HTTP ${videoResponse.status}`);
    }

    const videoBuffer = await videoResponse.buffer();
    const fileSize = videoBuffer.length;

    if (fileSize > 90 * 1024 * 1024) {
      await sock.sendMessage(
        from,
        { text: `❌ Video terlalu besar! (${(fileSize / (1024*1024)).toFixed(1)}MB)` }
      );
      return;
    }

    // Kirim video
    if (fileSize < 16 * 1024 * 1024) {
      await sock.sendMessage(
        from,
        { 
          video: videoBuffer,
          caption: "✅ *YouTube Download Selesai!*",
          fileName: `youtube_${Date.now()}.mp4`
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        from,
        { 
          document: videoBuffer,
          caption: "✅ *YouTube Download Selesai!*\n📁 Dikirim sebagai document",
          fileName: `youtube_${Date.now()}.mp4`,
          mimetype: 'video/mp4'
        },
        { quoted: msg }
      );
    }

  } catch (error) {
    console.error('Video Processing Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal memproses video:*\n${error.message}` 
      },
      { quoted: msg }
    );
  }
}