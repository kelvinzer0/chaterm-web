import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import db, { hashPassword, generateToken } from './db';

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


// DB Group Routes
app.get('/api/db/groups', (req, res) => {
  const groups = db.prepare('SELECT * FROM db_groups').all();
  res.json(groups);
});
app.post('/api/db/groups/create', (req, res) => {
  const id = Date.now().toString();
  const name = req.body.name || 'New Group';
  db.prepare('INSERT INTO db_groups (id, name) VALUES (?, ?)').run(id, name);
  res.json({ ok: true, group: { id, name } });
});
app.post('/api/db/groups/update', (req, res) => {
  const patch = req.body.patch;
  db.prepare('UPDATE db_groups SET name = ? WHERE id = ?').run(patch.name, patch.id);
  res.json({ ok: true, group: patch });
});
app.delete('/api/db/groups/:id', (req, res) => {
  db.prepare('DELETE FROM db_groups WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DB Asset Routes
app.get('/api/db/assets', (req, res) => {
  const assets = db.prepare('SELECT * FROM db_assets').all();
  res.json(assets.map((a: any) => ({ ...a, config: JSON.parse(a.config) })));
});
app.get('/api/db/assets/:id', (req, res) => {
  const asset: any = db.prepare('SELECT * FROM db_assets WHERE id = ?').get(req.params.id);
  res.json(asset ? { ...asset, config: JSON.parse(asset.config) } : null);
});
app.post('/api/db/assets/create', (req, res) => {
  const id = Date.now().toString();
  const asset = req.body;
  db.prepare('INSERT INTO db_assets (id, groupId, name, type, config) VALUES (?, ?, ?, ?, ?)').run(
    id, asset.groupId || '', asset.name || 'New Asset', asset.type || 'mysql', JSON.stringify(asset.config || {})
  );
  res.json({ ok: true, asset: { ...asset, id } });
});
app.post('/api/db/assets/update', (req, res) => {
  const patch = req.body.patch;
  db.prepare('UPDATE db_assets SET groupId = ?, name = ?, type = ?, config = ? WHERE id = ?').run(
    patch.groupId || '', patch.name || 'Updated', patch.type || 'mysql', JSON.stringify(patch.config || {}), patch.id
  );
  res.json({ ok: true, asset: patch });
});
app.delete('/api/db/assets/:id', (req, res) => {
  db.prepare('DELETE FROM db_assets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Mock DB functionality
app.post('/api/db/assets/test', (req, res) => res.json({ ok: true, serverVersion: 'SQLite 1.0', latencyMs: 1 }));
app.post('/api/db/assets/:id/connect', (req, res) => res.json({ ok: true }));
app.post('/api/db/assets/:id/disconnect', (req, res) => res.json({ ok: true }));
app.post('/api/db/assets/children', (req, res) => res.json({ ok: true, databases: ['main'], tables: ['users', 'db_groups', 'db_assets'], objects: [], columns: ['id'] }));
app.post('/api/db/assets/schemas', (req, res) => res.json({ ok: true, schemas: [{ name: 'public', isSystem: false }] }));
app.post('/api/db/assets/query', (req, res) => res.json({ ok: true, columns: ['status'], rows: [{ status: 'Query OK' }], rowCount: 1, durationMs: 1 }));
app.post('/api/db/assets/table-ddl', (req, res) => res.json({ ok: true, ddl: 'CREATE TABLE fake (id INT);' }));
app.post('/api/db/assets/query-table', (req, res) => res.json({ ok: true, columns: ['id'], rows: [{ id: 1 }], rowCount: 1, durationMs: 1, total: 1, knownColumns: ['id'] }));
app.post('/api/db/assets/count-table', (req, res) => res.json({ ok: true, total: 1, durationMs: 1 }));
app.post('/api/db/assets/column-distinct', (req, res) => res.json({ ok: true, values: ['1'] }));
app.post('/api/db/assets/detect-pk', (req, res) => res.json({ ok: true, primaryKey: ['id'] }));
app.post('/api/db/assets/mutations', (req, res) => res.json({ ok: true, affected: [1], durationMs: 1 }));

// User API
app.post('/api/user/login-pwd', (req, res) => {
  const { username, password } = req.body;
  const hashed = hashPassword(password);
  
  let user: any = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  
  // Auto-register if user doesn't exist
  if (!user) {
    const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, username, hashed);
    user = { id: result.lastInsertRowid, username, email: username, password: hashed };
  } else if (user.password !== hashed) {
    return res.status(401).json({ code: 401, message: 'Invalid password' });
  }
  
  const token = generateToken();
  db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, user.id);
  
  res.json({
    code: 200,
    data: { token, uid: user.id, username: user.username, email: user.email }
  });
});
  }
  
  const token = generateToken();
  db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, user.id);
  
  res.json({
    code: 200,
    data: { token, uid: user.id, username: user.username, email: user.email }
  });
});

app.post('/api/user/register', (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    const hashed = hashPassword(password);
    const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, email, hashed);
    const token = generateToken();
    db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, result.lastInsertRowid);
    
    res.json({
      code: 200,
      data: { token, uid: result.lastInsertRowid, username, email }
    });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

app.get('/api/user/info', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  
  const user: any = db.prepare('SELECT * FROM users WHERE token = ?').get(token);
  if (!user) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
  
  res.json({
    code: 200,
    data: { uid: user.id, username: user.username, email: user.email, avatar: '', isVip: true, vipExpireTime: '2099-12-31T23:59:59Z' }
  });
});

app.get('/api/branding-config', (req, res) => {
  res.json({ edition: 'cn', displayName: 'Chaterm Self-Hosted' });
});
