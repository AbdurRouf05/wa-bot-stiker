<div align="center">

# WA Bot Stiker

**Otomatisasi Bot WhatsApp untuk Pembuatan Stiker**

[![Node.js](https://img.shields.io/badge/Runtime-Node.js-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Library-Baileys-000000?style=flat-square&logo=whatsapp)](https://github.com/WhiskeySockets/Baileys)

</div>

---

## PROJECT OVERVIEW

Sebuah skrip bot otomatis berbasis Node.js yang berinteraksi langsung dengan API WhatsApp Socket (Baileys). Dirancang untuk melayani pembuatan stiker instan dari berbagai format media secara otomatis langsung melalui ruang obrolan pengguna.

## KEY FEATURES

- **Auto Media Conversion:** Konversi format gambar/video (JPG/PNG/MP4/GIF) menjadi stiker secara instan.
- **Fast Response:** Arsitektur asinkron untuk menjamin waktu respons (latency) yang sangat rendah.
- **Robust Connection:** Manajemen sesi dan rekoneksi otomatis menggunakan protokol Web Socket Baileys.
- **Customizable Commands:** Struktur kode modular yang memudahkan penambahan perintah baru.

## TECHNOLOGY STACK

- **Runtime Environment:** Node.js
- **WA Protocol Library:** Baileys (WA Socket)
- **Media Processing:** FFmpeg

## GETTING STARTED

**Prerequisites:** Node.js (v16+), FFmpeg

```bash
# Clone repository
git clone https://github.com/AbdurRouf05/wa-bot-stiker.git

# Install dependencies
npm install

# Run the bot
npm start
```

*Pindai QR Code yang muncul di terminal menggunakan WhatsApp Anda untuk menghubungkan sesi bot.*