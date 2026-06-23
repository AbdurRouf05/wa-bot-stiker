// commands/tebakkata.js
// Game Tebak Kata Sederhana

const SOAL = [
  { soal: "Benda langit yang menyala di malam hari, berawalan B", jawaban: "Bintang" },
  { soal: "Hewan berbelalai panjang", jawaban: "Gajah" },
  { soal: "Ibukota Indonesia", jawaban: "Jakarta" },
  { soal: "Buah yang isinya air, kulitnya hijau tebal", jawaban: "Semangka" },
  { soal: "Kendaraan roda empat", jawaban: "Mobil" },
  { soal: "Alat untuk menulis", jawaban: "Pensil" },
  { soal: "Tempat menyimpan uang", jawaban: "Bank" },
  { soal: "Makanan pokok orang Indonesia", jawaban: "Nasi" },
];

export default async ({ sock, msg, from }) => {
  // Cegah double game
  if (global.games?.tebakkata?.[from]) {
    await sock.sendMessage(
      from,
      { text: "Masih ada game Tebak Kata yang belum selesai di obrolan ini!" },
      { quoted: msg }
    );
    return;
  }

  // Pilih soal acak
  const acak = SOAL[Math.floor(Math.random() * SOAL.length)];
  
  // Hitung clue (huruf pertama + sensor)
  const jwb = acak.jawaban;
  let clue = jwb[0];
  for (let i = 1; i < jwb.length; i++) {
    clue += (jwb[i] === " ") ? " " : "-";
  }

  const timeout = 60000; // 60 detik

  await sock.sendMessage(
    from,
    { 
      text: `🎮 *TEBAK KATA* 🎮\n\nSoal: *${acak.soal}*\nClue: ${clue}\n\nWaktu: ${timeout / 1000} detik\nBalas pesan ini atau langsung ketik jawabannya!` 
    },
    { quoted: msg }
  );

  // Simpan state
  global.games.tebakkata[from] = {
    jawaban: acak.jawaban,
    timer: setTimeout(() => {
      // Jika waktu habis, hapus game dan beritahu
      if (global.games.tebakkata[from]) {
        sock.sendMessage(
          from,
          { text: `⏱️ Waktu Habis!\n\nJawaban yang benar adalah: *${acak.jawaban}*` }
        );
        delete global.games.tebakkata[from];
      }
    }, timeout)
  };
};
