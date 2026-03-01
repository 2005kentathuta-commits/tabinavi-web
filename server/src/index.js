const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Server } = require('socket.io');
const { createApp } = require('./createApp');

const PORT = process.env.PORT || 8787;

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const app = createApp({
  emitTripUpdated: (trip) => {
    io.to(`trip:${trip.id}`).emit('trip_updated', trip);
  },
});

server.on('request', app);

io.on('connection', (socket) => {
  socket.on('join_trip', (tripId) => {
    if (!tripId) {
      return;
    }
    socket.join(`trip:${tripId}`);
  });
});

const distPath = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(require('express').static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`travel-site server listening on http://localhost:${PORT}`);
});
