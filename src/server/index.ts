import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Chaterm Web Backend is running' }));
app.get('/api/branding-config', (req, res) => res.json({ enabled: false, displayName: 'Chaterm Web' }));
app.get('/api/release-notes', (req, res) => res.json(null));
app.get('/api/version-prompt', (req, res) => res.json({ shouldShow: false, version: 'web' }));
app.post('/api/system/info', (req, res) => res.json({ success: true, data: { os: 'web' } }));

// Simple terminal mock
wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.action === 'connectLocal' || data.action === 'shell') {
        const id = data.config?.id || data.params?.id || 'default';
        console.log(`Starting mock shell session: ${id}`);
        
        // Send a welcome message
        setTimeout(() => {
          ws.send(JSON.stringify({
            event: data.action === 'shell' ? `shellData:${id}` : `dataLocal:${id}`,
            data: '\r\n\x1b[32mWelcome to Chaterm Web (Mock SSH/Local Terminal)\x1b[0m\r\n$ '
          }));
        }, 500);
      }
      
      if (data.action === 'sendDataLocal' || data.action === 'writeToShell') {
        const id = data.terminalId || data.params?.id || 'default';
        const input = data.data || data.params?.data || '';
        
        // Echo input back
        ws.send(JSON.stringify({
          event: data.action === 'writeToShell' ? `shellData:${id}` : `dataLocal:${id}`,
          data: input
        }));
        
        // If Enter is pressed, simulate a response
        if (input === '\r') {
          ws.send(JSON.stringify({
            event: data.action === 'writeToShell' ? `shellData:${id}` : `dataLocal:${id}`,
            data: '\r\nMock command executed.\r\n$ '
          }));
        }
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chaterm Web Backend running on http://localhost:${PORT}`);
});
