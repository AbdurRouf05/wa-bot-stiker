// commands/profile.js

function getLevel(xp) {
  // Simple leveling formula: level = sqrt(xp / 100)
  // 100 xp = lvl 1, 400 xp = lvl 2, 900 xp = lvl 3, etc.
  if (xp <= 0) return 0;
  return Math.floor(Math.sqrt(xp / 100));
}

function getRole(level) {
  if (level >= 50) return "👑 Mythic Lord";
  if (level >= 40) return "🌟 Legendary Hero";
  if (level >= 30) return "⚔️ Grand Master";
  if (level >= 20) return "🛡️ Elite Knight";
  if (level >= 10) return "🏹 Seasoned Adventurer";
  if (level >= 5) return "🗡️ Novice Fighter";
  return "🌱 Peasant";
}

export default async ({ sock, from, msg, db }) => {
  const sender = msg.key.participant || msg.key.remoteJid;
  
  // Get data from DB
  const userData = db.getUser(sender);
  const pushName = msg.pushName || "Unknown Player";
  
  const xp = userData.xp || 0;
  const level = getLevel(xp);
  const role = getRole(level);
  
  // Hitung XP yang dibutuhkan untuk level berikutnya
  const nextLevel = level + 1;
  const xpForNextLevel = Math.pow(nextLevel, 2) * 100;
  
  // Progress bar sederhana (10 kotak)
  const currentLevelXp = Math.pow(level, 2) * 100;
  const xpProgress = xp - currentLevelXp;
  const xpNeeded = xpForNextLevel - currentLevelXp;
  const progressPercent = (xpProgress / xpNeeded) * 10;
  
  let progressBar = "";
  for (let i = 0; i < 10; i++) {
    progressBar += i < progressPercent ? "🟩" : "⬜";
  }

  const text = `
╭━━━〔 *PLAYER PROFILE* 〕━━━
┃ 👤 *Name* : ${pushName}
┃ 📛 *Role* : ${role}
┃ 🌟 *Level* : ${level}
╰━━━━━━━━━━━━━━━━━━━━━━

╭━━━〔 *STATUS & STATS* 〕━━━
┃ 🪙 *EXP*   : ${xp.toLocaleString('id-ID')} / ${xpForNextLevel.toLocaleString('id-ID')}
┃ 📊 *Progressbar*  : [${progressBar}]
╰━━━━━━━━━━━━━━━━━━━━━━

_Mainkan .ttt untuk menaikkan levelmu!_
  `.trim();

  let ppUrl;
  try {
    // Coba ambil foto profil WA pengguna
    ppUrl = await sock.profilePictureUrl(sender, 'image');
  } catch (err) {
    // Jika gagal (karena diprivat atau tidak ada foto), gunakan gambar default
    ppUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";
  }

  // Kirim selalu dengan gambar profil (asli atau default)
  await sock.sendMessage(from, { image: { url: ppUrl }, caption: text }, { quoted: msg });
};
