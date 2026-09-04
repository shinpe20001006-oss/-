const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// プレイヤー管理
const players = {};

function getRandomSpawn() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 15 + Math.random() * 5;
  return {
    x: Math.cos(angle) * radius,
    y: 1.6, // 視点の高さ
    z: Math.sin(angle) * radius
  };
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // 新規プレイヤー初期化
  const spawn = getRandomSpawn();
  players[socket.id] = {
    id: socket.id,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    rotationY: 0,
    hp: 100,
    score: 0
  };

  // 接続した本人に初期データと現在の全プレイヤー一覧を送る
  socket.emit('init', { id: socket.id, players });

  // 他の全員に新規参加を通知
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // 移動の同期
  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].rotationY = data.rotationY;
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  // 魔法弾の発射同期
  socket.on('shootSpell', (spellData) => {
    // 全員に弾の発射をブロードキャスト
    io.emit('spellSpawned', spellData);
  });

  // 被弾処理
  socket.on('playerHit', (data) => {
    const target = players[data.targetId];
    if (target && target.hp > 0) {
      target.hp -= data.damage;
      
      if (target.hp <= 0) {
        target.hp = 0;
        // キルスコア加算
        if (players[data.attackerId]) {
          players[data.attackerId].score += 1;
        }

        io.emit('playerKilled', {
          targetId: data.targetId,
          attackerId: data.attackerId,
          players
        });

        // 3秒後にリスポーン
        setTimeout(() => {
          if (players[data.targetId]) {
            const respawn = getRandomSpawn();
            players[data.targetId].x = respawn.x;
            players[data.targetId].y = respawn.y;
            players[data.targetId].z = respawn.z;
            players[data.targetId].hp = 100;
            io.emit('playerRespawned', players[data.targetId]);
          }
        }, 3000);

      } else {
        io.emit('hpUpdated', { id: target.id, hp: target.hp });
      }
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
