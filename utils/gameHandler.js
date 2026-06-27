// utils/gameHandler.js
import db from "./db.js";

export async function handleGameInput({ sock, msg, from, text, isGroup }) {
  if (!text) return false;

  const sender = msg.key.participant || msg.key.remoteJid;

  // 2. TIC-TAC-TOE
  if (global.games?.ttt?.[from]) {
    const game = global.games.ttt[from];
    
    // Cek apakah pesan berupa angka 1-9
    if (/^[1-9]$/.test(text)) {
      // Pastikan yang menjawab adalah pemain yang gilirannya
      const isPlayerX = sender === game.playerX;
      const isPlayerO = sender === game.playerO;
      
      if (!isPlayerX && !isPlayerO) return false; // Bukan pemain
      
      const isTurnX = game.turn === "X";
      if ((isPlayerX && !isTurnX) || (isPlayerO && isTurnX)) {
        // Bukan gilirannya
        return false;
      }

      const position = parseInt(text) - 1;
      
      // Jika petak sudah terisi
      if (game.board[position] === "X" || game.board[position] === "O") {
        await sock.sendMessage(from, { text: "❌ Petak sudah terisi!" }, { quoted: msg });
        return true;
      }

      // Tandai papan
      game.board[position] = game.turn;
      
      // Cek kemenangan
      if (checkWin(game.board, game.turn)) {
        clearTimeout(game.timer);
        
        const reward = 1000;
        const userData = db.getUser(sender);
        db.updateUser(sender, { xp: (userData.xp || 0) + reward });
        
        await sock.sendMessage(
          from,
          { 
            text: `🎉 *TIC-TAC-TOE SELESAI* 🎉\n\nPemenang: @${sender.split("@")[0]}\nHadiah: +${reward} XP\n\n${renderBoard(game.board)}`,
            mentions: [sender]
          }
        );
        delete global.games.ttt[from];
        return true;
      }

      // Cek seri
      if (!game.board.some(cell => typeof cell === "number")) {
        clearTimeout(game.timer);
        await sock.sendMessage(
          from,
          { text: `🤝 *TIC-TAC-TOE SERI* 🤝\n\n${renderBoard(game.board)}` }
        );
        delete global.games.ttt[from];
        return true;
      }

      // Lanjut giliran
      game.turn = game.turn === "X" ? "O" : "X";
      const nextPlayer = game.turn === "X" ? game.playerX : game.playerO;
      
      // Reset timer
      clearTimeout(game.timer);
      game.timer = setTimeout(() => {
        sock.sendMessage(from, { text: "⏱️ Waktu habis! Game TicTacToe dibatalkan." });
        delete global.games.ttt[from];
      }, 60000);

      await sock.sendMessage(
        from,
        { 
          text: `Giliran @${nextPlayer.split("@")[0]} (${game.turn})\nKirim angka 1-9 untuk mengisi petak.\n\n${renderBoard(game.board)}`,
          mentions: [nextPlayer]
        }
      );
      
      return true;
    }
  }

  return false;
}

// Fungsi bantu TicTacToe
function checkWin(b, p) {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Horizontal
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Vertikal
    [0, 4, 8], [2, 4, 6]             // Diagonal
  ];
  return wins.some(w => b[w[0]] === p && b[w[1]] === p && b[w[2]] === p);
}

export function renderBoard(b) {
  const mapCell = (c) => {
    if (c === "X") return "❌";
    if (c === "O") return "⭕";
    return ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"][c - 1];
  };
  return `
${mapCell(b[0])} ${mapCell(b[1])} ${mapCell(b[2])}
${mapCell(b[3])} ${mapCell(b[4])} ${mapCell(b[5])}
${mapCell(b[6])} ${mapCell(b[7])} ${mapCell(b[8])}
  `.trim();
}
