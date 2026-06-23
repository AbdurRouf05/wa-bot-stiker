// commands/ttt.js
// Tic Tac Toe
import { renderBoard } from "../utils/gameHandler.js";

export default async ({ sock, msg, from }) => {
  const sender = msg.key.participant || msg.key.remoteJid;

  // Cegah double game
  if (global.games?.ttt?.[from]) {
    await sock.sendMessage(
      from,
      { text: "❌ Masih ada game Tic-Tac-Toe yang belum selesai di obrolan ini!" },
      { quoted: msg }
    );
    return;
  }

  // Cek apakah ada yang di-tag / mention
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length === 0) {
    await sock.sendMessage(
      from,
      { text: "Tag orang yang ingin ditantang bermain Tic-Tac-Toe!\nContoh: *.ttt @teman*" },
      { quoted: msg }
    );
    return;
  }

  const opponent = mentions[0];

  if (opponent === sender) {
    await sock.sendMessage(
      from,
      { text: "❌ Kamu tidak bisa menantang dirimu sendiri!" },
      { quoted: msg }
    );
    return;
  }

  // Inisialisasi game
  const board = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const timeout = 60000;

  global.games.ttt[from] = {
    playerX: sender,    // Penantang jalan duluan (X)
    playerO: opponent,  // Ditantang (O)
    turn: "X",
    board: board,
    timer: setTimeout(() => {
      if (global.games.ttt[from]) {
        sock.sendMessage(from, { text: "⏱️ Waktu habis! Game Tic-Tac-Toe dibatalkan karena tidak ada langkah." });
        delete global.games.ttt[from];
      }
    }, timeout)
  };

  await sock.sendMessage(
    from,
    { 
      text: `🎮 *TIC-TAC-TOE* 🎮\n\n@${sender.split("@")[0]} (❌) menantang @${opponent.split("@")[0]} (⭕)\n\nGiliran: @${sender.split("@")[0]} (❌)\nSilakan kirim angka 1-9 untuk mengisi petak!\n\n${renderBoard(board)}`,
      mentions: [sender, opponent]
    }
  );
};
