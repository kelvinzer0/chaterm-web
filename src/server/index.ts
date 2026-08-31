import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Chaterm Web Backend is running' });
});

// Mock routes based on the preload API requirements
app.post('/api/system/info', (req, res) => {
  res.json({ success: true, data: { os: 'web' } });
});

wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });

  ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connection established' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chaterm Web Backend running on http://localhost:${PORT}`);
});

// Additional mocked routes for UI init
app.get('/api/branding-config', (req, res) => {
  res.json({ enabled: false, displayName: 'Chaterm Web' });
});

app.get('/api/release-notes', (req, res) => {
  res.json(null);
});

app.get('/api/version-prompt', (req, res) => {
  res.json({ shouldShow: false, version: 'web' });
});
