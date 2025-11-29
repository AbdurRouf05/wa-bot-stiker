// commands/ig.js - Instagram Downloader (Fixed for actual API response)
const fetch = require('node-fetch');

module.exports = async ({ sock, msg, from, args }) => {
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

    // Extract shortcode from Instagram URL
    const shortcode = getInstagramShortcode(url);
    if (!shortcode) {
      throw new Error('Tidak bisa mendapatkan ID media dari link Instagram');
    }

    console.log('Instagram Shortcode:', shortcode);

    // Use the exact API and parameters
    const apiUrl = 'https://instagram120.p.rapidapi.com/api/instagram/mediaByShortcode';
    
    const requestBody = {
      shortcode: shortcode
    };

    console.log('Mengirim request ke API Instagram...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': 'c60a569d9bmshc8784a5743699a0p10423cjsn8b083ea602a2',
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
    console.log('API Response Data received successfully');

    // PROCESS THE ACTUAL RESPONSE STRUCTURE FROM YOUR LOG
    let mediaUrl, mediaType, username, caption;

    // Response adalah array, ambil elemen pertama
    if (Array.isArray(data) && data.length > 0) {
      const firstItem = data[0];
      
      // Cek apakah ada URLs array
      if (firstItem.urls && firstItem.urls.length > 0) {
        // Ambil URL video pertama (MP4)
        const videoUrlObj = firstItem.urls.find(url => url.extension === 'mp4');
        if (videoUrlObj) {
          mediaUrl = videoUrlObj.url;
          mediaType = 'video';
          console.log('Video URL found:', mediaUrl);
        }
      }
      
      // Ambil metadata
      if (firstItem.meta) {
        username = firstItem.meta.username || 'Instagram';
        caption = firstItem.meta.title || '';
        console.log('Username:', username);
      }
      
      // Fallback: Jika tidak ada di urls, coba pictureUrl (mungkin image post)
      if (!mediaUrl && firstItem.pictureUrl) {
        mediaUrl = firstItem.pictureUrl;
        mediaType = 'image';
        console.log('Image URL found:', mediaUrl);
      }
    } 
    else {
      console.log('Struktur response tidak dikenali:', data);
      throw new Error('Struktur response API tidak dikenali');
    }

    if (!mediaUrl) {
      console.log('Tidak ada media URL yang ditemukan dalam response');
      throw new Error('Tidak bisa menemukan URL media dalam response');
    }

    await sock.sendMessage(
      from,
      { text: `📥 *Media ditemukan!*\n👤 ${username}\n⏳ Sedang mendownload...` },
      { quoted: msg }
    );

    console.log('Download dari:', mediaUrl);
    
    // Download media dengan timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 second timeout

    try {
      const mediaResponse = await fetch(mediaUrl, { 
        signal: controller.signal 
      });
      
      clearTimeout(timeout);
      
      if (!mediaResponse.ok) {
        throw new Error(`Gagal download media: HTTP ${mediaResponse.status}`);
      }

      const mediaBuffer = await mediaResponse.buffer();
      const fileSize = mediaBuffer.length;

      if (fileSize > 90 * 1024 * 1024) {
        await sock.sendMessage(
          from,
          { text: `❌ Media terlalu besar! (${(fileSize / (1024*1024)).toFixed(1)}MB)` }
        );
        return;
      }

      const finalCaption = `✅ *Instagram Download Selesai!*\n👤 ${username}${caption ? `\n📝 ${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}` : ''}`;

      // Send media based on type
      if (mediaType === 'video') {
        if (fileSize < 16 * 1024 * 1024) {
          await sock.sendMessage(
            from,
            { 
              video: mediaBuffer,
              caption: finalCaption,
              fileName: `instagram_${Date.now()}.mp4`
            }
          );
        } else {
          await sock.sendMessage(
            from,
            { 
              document: mediaBuffer,
              caption: finalCaption + '\n📁 Dikirim sebagai document',
              fileName: `instagram_${Date.now()}.mp4`,
              mimetype: 'video/mp4'
            }
          );
        }
      } else {
        // Image
        if (fileSize < 5 * 1024 * 1024) {
          await sock.sendMessage(
            from,
            { 
              image: mediaBuffer,
              caption: finalCaption
            }
          );
        } else {
          await sock.sendMessage(
            from,
            { 
              document: mediaBuffer,
              caption: finalCaption + '\n📁 Dikirim sebagai document',
              fileName: `instagram_${Date.now()}.jpg`,
              mimetype: 'image/jpeg'
            }
          );
        }
      }

      console.log('✅ Instagram download berhasil!');

    } catch (downloadError) {
      clearTimeout(timeout);
      if (downloadError.name === 'AbortError') {
        throw new Error('Download timeout - coba lagi');
      }
      throw downloadError;
    }

  } catch (error) {
    console.error('Instagram Download Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal download Instagram!*\nError: ${error.message}\n\n💡 *Cek:*\n• Apakah post bersifat public?\n• Coba link yang berbeda\n• Pastikan koneksi internet stabil` 
      },
      { quoted: msg }
    );
  }
};

// Helper function to extract shortcode from Instagram URL
function getInstagramShortcode(url) {
  // Handle various Instagram URL formats
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