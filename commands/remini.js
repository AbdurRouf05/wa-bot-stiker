// commands/remini.js - Photo Enhance (Powered by RapidAPI)
const fetch = require('node-fetch');

module.exports = async ({ sock, msg, from, args, getMediaBuffer }) => {
  const media = await getMediaBuffer(msg);
  
  if (!media || media.type !== "imageMessage") {
    return await sock.sendMessage(
      from,
      { 
        text: "❌ *Cara penggunaan:*\nReply foto dengan *.remini*\n\n💡 Fitur ini akan menjernihkan foto yang blur/low-res menggunakan AI." 
      },
      { quoted: msg }
    );
  }

  try {
    await sock.sendMessage(
      from,
      { text: "⏳ *Sedang diproses oleh AI...*\nMohon tunggu sebentar (biasanya 5-10 detik)." },
      { quoted: msg }
    );

    // 1. Konversi Buffer ke Base64 (API butuh base64 tanpa prefix)
    const base64Image = media.buffer.toString('base64');

    // 2. Konfigurasi API (Berdasarkan screenshot pengguna)
    const apiUrl = 'https://photo-enhance-api.p.rapidapi.com/api/scale';
    const requestBody = {
      image_base64: base64Image,
      type: 'clean',
      scale_factor: 2 // default upscale 2x
    };

    console.log('Mengantar foto ke AI Enhance...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': 'c60a569d9bmshc8784a5743699a0p10423cjsn8b083ea602a2',
        'x-rapidapi-host': 'photo-enhance-api.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Enhance Error:', response.status, errorText);
      throw new Error(`API error (HTTP ${response.status})`);
    }

    const data = await response.json();
    console.log('API Enhance berhasil merespons.');

    // 3. Ambil hasil (Biasanya ada di data_base64 atau link)
    let resultBuffer;
    
    if (data.data_base64) {
      // Jika balikannya base64
      resultBuffer = Buffer.from(data.data_base64, 'base64');
    } else if (data.url || data.link) {
      // Jika balikannya URL
      const resImg = await fetch(data.url || data.link);
      resultBuffer = await resImg.buffer();
    } else if (data.image_base64) {
      resultBuffer = Buffer.from(data.image_base64, 'base64');
    } else {
      console.log('Structure response:', data);
      throw new Error('Tidak bisa menemukan hasil gambar dalam response API.');
    }

    // 4. Kirim hasil
    await sock.sendMessage(
      from,
      { 
        image: resultBuffer,
        caption: "✅ *Proses Remini Selesai!* 📸\nKualitas foto telah ditingkatkan oleh AI." 
      },
      { quoted: msg }
    );

    console.log('✅ Remini berhasil dikirim!');

  } catch (error) {
    console.error('Remini Error:', error);
    await sock.sendMessage(
      from,
      { 
        text: `❌ *Gagal memproses Remini!*\nError: ${error.message}\n\nMungkin limit API habis atau foto terlalu besar.` 
      },
      { quoted: msg }
    );
  }
};
