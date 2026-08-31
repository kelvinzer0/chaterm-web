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

// Mock DB Routes
app.get('/api/db/groups', (req, res) => res.json([]));
app.post('/api/db/groups/create', (req, res) => res.json({ ok: true, group: req.body }));
app.post('/api/db/groups/update', (req, res) => res.json({ ok: true, group: req.body.patch }));
app.delete('/api/db/groups/:id', (req, res) => res.json({ ok: true }));

app.get('/api/db/assets', (req, res) => res.json([]));
app.get('/api/db/assets/:id', (req, res) => res.json(null));
app.post('/api/db/assets/create', (req, res) => res.json({ ok: true, asset: req.body }));
app.post('/api/db/assets/update', (req, res) => res.json({ ok: true, asset: req.body.patch }));
app.delete('/api/db/assets/:id', (req, res) => res.json({ ok: true }));

app.post('/api/db/assets/test', (req, res) => res.json({ ok: true, serverVersion: 'MockDB 1.0', latencyMs: 42 }));
app.post('/api/db/assets/:id/connect', (req, res) => res.json({ ok: true }));
app.post('/api/db/assets/:id/disconnect', (req, res) => res.json({ ok: true }));

app.post('/api/db/assets/children', (req, res) => {
  res.json({ ok: true, databases: ['mock_db'], tables: ['mock_table'], objects: [], columns: ['id', 'name'] });
});
app.post('/api/db/assets/schemas', (req, res) => res.json({ ok: true, schemas: [{ name: 'public', isSystem: false }] }));
app.post('/api/db/assets/query', (req, res) => {
  res.json({ ok: true, columns: ['mock_col'], rows: [{ mock_col: 'mock_val' }], rowCount: 1, durationMs: 1 });
});
app.post('/api/db/assets/table-ddl', (req, res) => res.json({ ok: true, ddl: 'CREATE TABLE mock_table (id INT);' }));
app.post('/api/db/assets/query-table', (req, res) => {
  res.json({ ok: true, columns: ['id', 'name'], rows: [{ id: 1, name: 'Test' }], rowCount: 1, durationMs: 1, total: 1, knownColumns: ['id', 'name'] });
});
app.post('/api/db/assets/count-table', (req, res) => res.json({ ok: true, total: 1, durationMs: 1 }));
app.post('/api/db/assets/column-distinct', (req, res) => res.json({ ok: true, values: ['Test'] }));
app.post('/api/db/assets/detect-pk', (req, res) => res.json({ ok: true, primaryKey: ['id'] }));
app.post('/api/db/assets/mutations', (req, res) => res.json({ ok: true, affected: [1], durationMs: 1 }));

// Mock User API for Web Port
app.post('/api/user/login-pwd', (req, res) => {
  res.json({
    code: 200,
    data: {
      token: 'mock-token-123',
      uid: 1,
      username: req.body.username || 'mockuser',
      email: req.body.username || 'mock@example.com'
    }
  });
});

app.post('/api/user/register', (req, res) => {
  res.json({
    code: 200,
    data: {
      token: 'mock-token-123',
      uid: 1,
      username: req.body.email || 'mockuser',
      email: req.body.email || 'mock@example.com'
    }
  });
});
