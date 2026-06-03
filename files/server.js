const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 创建 uploads 文件夹，用来临时存手机上传的视频
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// 设置上传规则
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 最大 500MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 公开 public 文件夹，比如 control.html / tablet.html
app.use(express.static(path.join(__dirname, 'public')));

// 公开 uploads 文件夹，让 tablet.html 可以播放上传后的视频
app.use('/uploads', express.static(uploadsDir));

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

// 手机上传视频接口
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video uploaded' });
  }

  const videoUrl = `/uploads/${req.file.filename}`;

  console.log(`[upload] Video uploaded: ${videoUrl}`);

  res.json({
    success: true,
    url: videoUrl
  });
});

// Push video URL to all connected tablets
app.post('/api/push', (req, res) => {
  const { videoUrl, theme, lights } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl required' });
  }

  const payload = JSON.stringify({
    type: 'play',
    videoUrl,
    theme,
    lights
  });

  let sent = 0;

  tablets.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(payload);
      sent++;
    }
  });

  console.log(`[push] Sent to ${sent} tablet(s): ${theme}`);

  res.json({
    success: true,
    tabletCount: sent
  });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    tablets: tablets.size,
    online: true
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`\n  Car Workshop Server running on http://localhost:${PORT}`);
  console.log(`  Control page: http://localhost:${PORT}/control.html`);
  console.log(`  Tablet page:  http://localhost:${PORT}/tablet.html\n`);
});
