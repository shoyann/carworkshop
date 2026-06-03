const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Track connected tablets
const tablets = new Set();

wss.on('connection', (ws, req) => {
  const isTablet = req.url === '/tablet';
  if (isTablet) {
    tablets.add(ws);
    console.log(`[+] Tablet connected. Total tablets: ${tablets.size}`);
    ws.send(JSON.stringify({ type: 'ready', message: 'Car Workshop Ready' }));
  }

  ws.on('close', () => {
    if (isTablet) {
      tablets.delete(ws);
      console.log(`[-] Tablet disconnected. Total tablets: ${tablets.size}`);
    }
  });
});

// Push video URL to all connected tablets
app.post('/api/push', (req, res) => {
  const { videoUrl, theme, lights } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' });

  const payload = JSON.stringify({ type: 'play', videoUrl, theme, lights });
  let sent = 0;
  tablets.forEach(ws => {
    if (ws.readyState === 1) { ws.send(payload); sent++; }
  });

  console.log(`[push] Sent to ${sent} tablet(s): ${theme}`);
  res.json({ success: true, tabletCount: sent });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({ tablets: tablets.size, online: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  Car Workshop Server running on http://localhost:${PORT}`);
  console.log(`  Control page: http://localhost:${PORT}/control.html`);
  console.log(`  Tablet page:  http://localhost:${PORT}/tablet.html\n`);
});
