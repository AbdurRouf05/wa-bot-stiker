// commands/ig.js - Instagram Downloader (Fixed for actual API response)
import fetch from 'node-fetch';

// Helper function to extract shortcode from Instagram URL
function getInstagramShortcode(url) {
  const patterns = [
    /instagram\.com\/reel\/([^\/?]+)/,
    /instagram\.com\/p\/([^\/?]+)/,
    /instagram\.com\/tv\/([^\/?]+)/,
    /instagram\.com\/reels\/([^\/?]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

export default async ({ sock, msg, from, args }) => {
  if (args.length === 0) {
    return await sock.sendMessage(
      from,
      { 
        text: "❌ *Cara penggunaan:*\n.ig [url_instagram]\nContoh: .ig https://www.instagram.com/reel/xxx/" 
      },
      { quoted: msg }
    );
  }

  const url = args[0];
  
  if (!url.includes('instagram.com')) {
    return await sock.sendMessage(
      from,
      { text: "❌ URL Instagram tidak valid!" },
      { quoted: msg }
    );
  }

  try {
    await sock.sendMessage(
      from,
      { text: "⏳ *Mendownload dari Instagram...*" },
      { quoted: msg }
    );

    const shortcode = getInstagramShortcode(url);
    if (!shortcode) {
      throw new Error('Tidak bisa mendapatkan ID media dari link Instagram');
    }

    const apiUrl = 'https://instagram120.p.rapidapi.com/api/instagram/mediaByShortcode';
    const requestBody = { shortcode };

    console.log('Mengirim request ke API Instagram...');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'instagram120.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Response Error:', response.status, errorText);
      throw new Error(`API merespons dengan status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Struktur response API tidak dikenali atau kosong');
    }

    const firstItem = data[0];
    let username = 'Instagram';
    let caption = '';
    
    if (firstItem.meta) {
      username = firstItem.meta.username || 'Instagram';
      caption = firstItem.meta.title || '';
    }

    await sock.sendMessage(
      from,
      { text: `📥 *Media ditemukan!*\n👤 ${username}\n⏳ Sedang mendownload...` },
      { quoted: msg }
    );

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      let mediaUrl, mediaType;

      if (item.urls && item.urls.length > 0) {
        const videoUrlObj = item.urls.find(url => url.extension === 'mp4');
        if (videoUrlObj) {
          mediaUrl = videoUrlObj.url;
          mediaType = 'video';
        }
      }
      
      if (!mediaUrl && item.pictureUrl) {
        mediaUrl = item.pictureUrl;
        mediaType = 'image';
      }

      if (!mediaUrl) {
        console.error(`Tidak ada mediaUrl untuk slide ${i+1}`);
        continue;
      }

      try {
        const mediaResponse = await fetch(mediaUrl);
        if (!mediaResponse.ok) {
          console.error(`Gagal download media slide ${i+1}: HTTP ${mediaResponse.status}`);
          continue;
        }

        const mediaBuffer = await mediaResponse.buffer();
        const fileSize = mediaBuffer.length;

        if (fileSize > 90 * 1024 * 1024) {
          await sock.sendMessage(from, { text: `❌ Media slide ${i+1} terlalu besar! (${(fileSize / (1024*1024)).toFixed(1)}MB)` });
          continue;
        }

        let finalCaption = `✅ *Instagram Download*\n👤 ${username}`;
        if (data.length > 1) {
          finalCaption = `✅ *Instagram Slide (${i+1}/${data.length})*\n👤 ${username}`;
        }
        // Include caption on the first slide
        if (i === 0 && caption) {
          finalCaption += `\n📝 ${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}`;
        }

        if (mediaType === 'video') {
          if (fileSize < 16 * 1024 * 1024) {
            await sock.sendMessage(from, { video: mediaBuffer, caption: finalCaption, fileName: `instagram_${Date.now()}.mp4` });
          } else {
            await sock.sendMessage(from, { document: mediaBuffer, caption: finalCaption + '\n📁 Dikirim sebagai document', fileName: `instagram_${Date.now()}.mp4`, mimetype: 'video/mp4' });
          }
        } else {
          if (fileSize < 5 * 1024 * 1024) {
            await sock.sendMessage(from, { image: mediaBuffer, caption: finalCaption });
          } else {
            await sock.sendMessage(from, { document: mediaBuffer, caption: finalCaption + '\n📁 Dikirim sebagai document', fileName: `instagram_${Date.now()}.jpg`, mimetype: 'image/jpeg' });
          }
        }
      } catch (e) {
        console.error(`Error downloading slide ${i+1}:`, e.message);
      }
    }

  } catch (error) {
    console.error('Instagram Download Error:', error);
    await sock.sendMessage(from, { text: `❌ *Gagal download Instagram!*\nError: ${error.message}` }, { quoted: msg });
  }
};