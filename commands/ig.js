// commands/ig.js - Instagram Downloader via coder2077 API (Supports Video, Reels & Photo/Carousel)
import fetch from 'node-fetch';

export default async ({ sock, msg, from, args }) => {
  if (args.length === 0) {
    return await sock.sendMessage(
      from,
      {
        text: '❌ *Cara penggunaan:*\n.ig [url_instagram]\nContoh: .ig https://www.instagram.com/reel/xxx/'
      },
      { quoted: msg }
    );
  }

  const url = args[0];

  if (!url.includes('instagram.com')) {
    return await sock.sendMessage(
      from,
      { text: '❌ URL Instagram tidak valid! Masukkan link reels, postingan foto, atau slide album.' },
      { quoted: msg }
    );
  }

  try {
    await sock.sendMessage(
      from,
      { text: '⏳ *Sedang memproses media Instagram...*' },
      { quoted: msg }
    );

    const host = 'instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com';
    const apiUrl = `https://${host}/fetch?url=${encodeURIComponent(url)}`;

    console.log('Mengirim request ke API Instagram (coder2077)...');
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': host
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Response Error:', response.status, errorText);
      throw new Error(`API merespons status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.detail || 'Gagal mengambil media dari Instagram. Pastikan akun tidak diprivat.');
    }

    const caption = data.caption || '';
    const cleanCaption = caption.length > 250 ? caption.substring(0, 250) + '...' : caption;

    // Kumpulkan media: mendukung single video/foto maupun album/carousel slide
    let mediaItems = [];

    if (Array.isArray(data.items) && data.items.length > 0) {
      mediaItems = data.items;
    } else if (data.download_url) {
      mediaItems = [{
        type: data.type || (data.download_url.includes('.mp4') ? 'video' : 'image'),
        download_url: data.download_url
      }];
    } else if (Array.isArray(data.medias) && data.medias.length > 0) {
      mediaItems = data.medias;
    }

    if (mediaItems.length === 0) {
      throw new Error('Tidak ditemukan media yang dapat diunduh.');
    }

    await sock.sendMessage(
      from,
      { text: `📥 *Ditemukan ${mediaItems.length} media!* Mengirim ke chat...` },
      { quoted: msg }
    );

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      const mediaUrl = item.download_url || item.url;
      const isVideo = item.type === 'video' || (mediaUrl && mediaUrl.includes('.mp4'));

      if (!mediaUrl) continue;

      try {
        const mediaRes = await fetch(mediaUrl);
        if (!mediaRes.ok) {
          console.error(`Gagal download item ke-${i + 1}: HTTP ${mediaRes.status}`);
          continue;
        }

        const buffer = await mediaRes.buffer();
        const fileSize = buffer.length;

        if (fileSize > 90 * 1024 * 1024) {
          await sock.sendMessage(from, { text: `❌ Media ke-${i + 1} terlalu besar (>90MB).` }, { quoted: msg });
          continue;
        }

        let itemCaption = '✅ *Instagram Download*';
        if (mediaItems.length > 1) {
          itemCaption += ` *(${i + 1}/${mediaItems.length})*`;
        }
        if (i === 0 && cleanCaption) {
          itemCaption += `\n\n📝 ${cleanCaption}`;
        }

        if (isVideo) {
          if (fileSize < 16 * 1024 * 1024) {
            await sock.sendMessage(from, { video: buffer, caption: itemCaption, fileName: `ig_${Date.now()}.mp4` });
          } else {
            await sock.sendMessage(from, { document: buffer, caption: itemCaption + '\n📁 Dikirim sebagai dokumen', fileName: `ig_${Date.now()}.mp4`, mimetype: 'video/mp4' });
          }
        } else {
          if (fileSize < 5 * 1024 * 1024) {
            await sock.sendMessage(from, { image: buffer, caption: itemCaption });
          } else {
            await sock.sendMessage(from, { document: buffer, caption: itemCaption + '\n📁 Dikirim sebagai dokumen', fileName: `ig_${Date.now()}.jpg`, mimetype: 'image/jpeg' });
          }
        }
      } catch (err) {
        console.error(`Error kirim media ke-${i + 1}:`, err.message);
      }
    }

  } catch (error) {
    console.error('Instagram Download Error:', error);
    await sock.sendMessage(from, { text: `❌ *Gagal download Instagram!*\nError: ${error.message}` }, { quoted: msg });
  }
};
