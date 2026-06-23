// commands/math.js
// Kalkulator sederhana
export default async ({ sock, msg, from, args }) => {
  if (args.length === 0) {
    await sock.sendMessage(
      from,
      { text: "Masukkan operasi matematika. Contoh: *.math 5 + 5 * 2*" },
      { quoted: msg }
    );
    return;
  }

  const expression = args.join(" ");

  // Validasi: hanya boleh angka dan operator matematika (mencegah remote code execution via eval)
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
    await sock.sendMessage(
      from,
      { text: "❌ Hanya mendukung angka dan operator matematika dasar (+, -, *, /)." },
      { quoted: msg }
    );
    return;
  }

  try {
    // eslint-disable-next-line no-eval
    const result = eval(expression);
    await sock.sendMessage(
      from,
      { text: `Hasil dari *${expression}* = *${result}*` },
      { quoted: msg }
    );
  } catch (err) {
    await sock.sendMessage(
      from,
      { text: "❌ Format matematika tidak valid." },
      { quoted: msg }
    );
  }
};
