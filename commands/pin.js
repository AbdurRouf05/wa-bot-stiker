// commands/pin.js - Pinterest Downloader
import fetch from 'node-fetch';

export default async ({ sock, msg, from, args }) => {
  if (args.length === 0) {
    return await sock.sendMessage(
      from,
      { 
        text: "❌ *Cara penggunaan:*\n.pin [url_pinterest]\nContoh: .pin https://pin.it/..." 
      },
      { quoted: msg }
    );
  }

  const url = args[0];
  
  if (!url.includes('pinterest.com') && !url.includes('pin.it')) {
    return await sock.sendMessage(
      from,
      { text: "❌ URL Pinterest tidak valid!" },
      { quoted: msg }
    );
  }

  try {
    await sock.sendMessage(
      from,
      { text: "⏳ *Mendownload dari Pinterest...*" },
      { quoted: msg }
    );

    const apiUrl = `https://pinterest-video-and-image-downloader.p.rapidapi.com/pinterest?url=${encodeURIComponent(url)}`;
    
    console.log('Mengirim request ke API Pinterest...');
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'pinterest-video-and-image-downloader.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Response Error:', response.status, errorText);
      throw new Error(`API merespons dengan status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.data || !data.data.url) {
      throw new Error('Gagal mendapatkan media dari URL tersebut.');
    }

    const title = data.data.title || 'Pinterest Media';
    const mediaUrl = data.data.url;
    
    // Check if there is a carousel
    let mediaList = [];
    if (data.data.carousel && Array.isArray(data.data.carousel)) {
      mediaList = data.data.carousel;
    } else {
      mediaList = [mediaUrl];
    }

    await sock.sendMessage(
      from,
      { text: `📥 *Media ditemukan!*\n📝 ${title}\n⏳ Sedang mendownload...` },
      { quoted: msg }
    );

    for (let i = 0; i < mediaList.length; i++) {
      const currentMediaUrl = mediaList[i];
      const isVideo = currentMediaUrl.includes('.mp4') || currentMediaUrl.includes('video');
      
      const mediaResponse = await fetch(currentMediaUrl);
      if (!mediaResponse.ok) {
        console.error(`Gagal download media slide ${i+1}: HTTP ${mediaResponse.status}`);
        continue; // Skip failed media
      }

      const mediaBuffer = await mediaResponse.buffer();
      const fileSize = mediaBuffer.length;
      
      if (fileSize > 90 * 1024 * 1024) {
        await sock.sendMessage(from, { text: `❌ Media slide ${i+1} terlalu besar! (${(fileSize / (1024*1024)).toFixed(1)}MB)` });
        continue;
      }

      const captionText = mediaList.length > 1 ? `✅ *Pinterest Download (Slide ${i+1}/${mediaList.length})*\n📝 ${title}` : `✅ *Pinterest Download*\n📝 ${title}`;

      if (isVideo) {
        if (fileSize < 16 * 1024 * 1024) {
          await sock.sendMessage(from, { video: mediaBuffer, caption: captionText, fileName: `pinterest_${Date.now()}.mp4` });
        } else {
          await sock.sendMessage(from, { document: mediaBuffer, caption: captionText + '\n📁 Dikirim sebagai document', fileName: `pinterest_${Date.now()}.mp4`, mimetype: 'video/mp4' });
        }
      } else {
        if (fileSize < 5 * 1024 * 1024) {
          await sock.sendMessage(from, { image: mediaBuffer, caption: captionText });
        } else {
          await sock.sendMessage(from, { document: mediaBuffer, caption: captionText + '\n📁 Dikirim sebagai document', fileName: `pinterest_${Date.now()}.jpg`, mimetype: 'image/jpeg' });
        }
      }
    }

  } catch (error) {
    console.error('Pinterest Download Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal download Pinterest!*\nError: ${error.message}\n\nCoba link lain atau periksa API Key.` 
      },
      { quoted: msg }
    );
  }
};
