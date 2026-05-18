// Simple Socket.io signaling server for WebRTC offers/answers/ICE
// Usage: node server/signaling-server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }
});

// Map of userId -> socketId
const users = {};

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('register', (payload) => {
    const userId = payload && payload.userId;
    if (userId) {
      users[userId] = socket.id;
      socket.userId = userId;
      console.log('registered', userId, '->', socket.id);
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      console.log('disconnect', socket.userId);
      delete users[socket.userId];
    }
  });

  // Forward signaling events to the target user socket
  const forwardEvent = (eventName) => {
    socket.on(eventName, (data) => {
      try {
        const toUserId = data && (data.toUserId || data.to); // support both
        const fromUserId = socket.userId || (data && data.fromUserId) || null;
        if (!toUserId) return;
        const targetSocketId = users[toUserId];
        if (targetSocketId) {
          io.to(targetSocketId).emit(eventName, Object.assign({}, data, { fromUserId }));
        }
      } catch (err) {
        console.error('forward error', err);
      }
    });
  };

  ['webrtc_offer','webrtc_answer','webrtc_ice_candidate','webrtc_request_offer'].forEach(forwardEvent);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Signaling server listening on http://localhost:${PORT}`));
