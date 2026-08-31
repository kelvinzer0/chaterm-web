const BACKEND_URL = 'http://localhost:3000';

// WebSocket connection for terminal events
let wsConnection: WebSocket | null = null;
const eventHandlers = new Map<string, Array<(data: any) => void>>();

function getWsConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      return resolve(wsConnection);
    }
    const ws = new WebSocket(`ws://${location.hostname}:3000`);
    ws.onopen = () => {
      wsConnection = ws;
      resolve(ws);
    };
    ws.onerror = (err) => reject(err);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event && eventHandlers.has(msg.event)) {
          eventHandlers.get(msg.event)!.forEach(cb => cb(msg.data));
        }
      } catch (e) {
        console.error('WebSocket message parsing error:', e);
      }
    };
  });
}

function registerEvent(eventName: string, callback: (data: any) => void) {
  if (!eventHandlers.has(eventName)) {
    eventHandlers.set(eventName, []);
  }
  eventHandlers.get(eventName)!.push(callback);
  return () => {
    const handlers = eventHandlers.get(eventName)!;
    const index = handlers.indexOf(callback);
    if (index > -1) handlers.splice(index, 1);
  };
}

async function fetchBackend(path: string, options: RequestInit = {}) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      }
    });
    return await res.json();
  } catch (err) {
    console.error(`Backend fetch error for ${path}:`, err);
    return { success: false, error: String(err) };
  }
}

export function injectWebBridge() {
  if (typeof window === 'undefined') return;

  const mockApi: any = {
    getBrandingConfig: () => fetchBackend('/api/branding-config'),
    getSystemInfo: () => fetchBackend('/api/system/info'),
    getReleaseNotes: () => fetchBackend('/api/release-notes'),
    getVersionPrompt: () => fetchBackend('/api/version-prompt'),
    
    // Auth and Config stubs
    getCookie: async () => ({ success: true, value: '' }),
    setCookie: async () => ({ success: true }),
    getAllCookies: async () => ({ success: true, cookies: [] }),
    removeCookie: async () => ({ success: true }),
    
    // Basic overrides
    getLocalIP: async () => '127.0.0.1',
    getMacAddress: async () => '00:00:00:00:00:00',
    getPlatform: async () => 'web',
    getHomePath: async () => '/home/webuser',
    
    // Terminal and SSH WS integration
    connectLocal: async (config: any) => {
      try {
        const ws = await getWsConnection();
        ws.send(JSON.stringify({ action: 'connectLocal', config }));
        return { success: true };
      } catch (err) {
        return { success: false, message: String(err) };
      }
    },
    sendDataLocal: async (terminalId: string, data: string) => {
      try {
        const ws = await getWsConnection();
        ws.send(JSON.stringify({ action: 'sendDataLocal', terminalId, data }));
        return { success: true };
      } catch (err) {
        return { success: false, message: String(err) };
      }
    },
    resizeLocal: async (terminalId: string, cols: number, rows: number) => {
      const ws = await getWsConnection();
      ws.send(JSON.stringify({ action: 'resizeLocal', terminalId, cols, rows }));
      return { success: true };
    },
    closeLocal: async (terminalId: string) => {
      const ws = await getWsConnection();
      ws.send(JSON.stringify({ action: 'closeLocal', terminalId }));
      return { success: true };
    },
    onDataLocal: (id: string, callback: (data: string) => void) => {
      return registerEvent(`dataLocal:${id}`, callback);
    },
    onExitLocal: (id: string, callback: (exitCode: unknown) => void) => {
      return registerEvent(`exitLocal:${id}`, callback);
    },
    
    shell: async (params: any) => {
      const ws = await getWsConnection();
      ws.send(JSON.stringify({ action: 'shell', params }));
      return { id: params.id, success: true };
    },
    writeToShell: async (params: any) => {
      const ws = await getWsConnection();
      ws.send(JSON.stringify({ action: 'writeToShell', params }));
      return { success: true };
    },
    onShellData: (id: string, callback: (data: any) => void) => {
      return registerEvent(`shellData:${id}`, callback);
    },
    onShellClose: (id: string, callback: (data?: any) => void) => {
      return registerEvent(`shellClose:${id}`, callback);
    },
    onShellError: (id: string, callback: (data: any) => void) => {
      return registerEvent(`shellError:${id}`, callback);
    },
    disconnect: async (params: any) => {
      const ws = await getWsConnection();
      ws.send(JSON.stringify({ action: 'disconnect', params }));
      return { success: true };
    },
    
    // Database integration
    dbAssetGroupList: () => fetchBackend('/api/db/groups'),
    dbAssetGroupCreate: (payload: any) => fetchBackend('/api/db/groups/create', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetGroupUpdate: (payload: any) => fetchBackend('/api/db/groups/update', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetGroupDelete: (id: string) => fetchBackend(`/api/db/groups/${id}`, { method: 'DELETE' }),
    
    dbAssetList: () => fetchBackend('/api/db/assets'),
    dbAssetGet: (id: string) => fetchBackend(`/api/db/assets/${id}`),
    dbAssetCreate: (payload: any) => fetchBackend('/api/db/assets/create', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetUpdate: (payload: any) => fetchBackend('/api/db/assets/update', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetDelete: (id: string) => fetchBackend(`/api/db/assets/${id}`, { method: 'DELETE' }),
    
    dbAssetTestConnection: (payload: any) => fetchBackend('/api/db/assets/test', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetConnect: (id: string) => fetchBackend(`/api/db/assets/${id}/connect`, { method: 'POST' }),
    dbAssetDisconnect: (id: string) => fetchBackend(`/api/db/assets/${id}/disconnect`, { method: 'POST' }),
    
    dbAssetListChildren: (payload: any) => fetchBackend('/api/db/assets/children', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetListSchemas: (payload: any) => fetchBackend('/api/db/assets/schemas', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetExecuteQuery: (payload: any) => fetchBackend('/api/db/assets/query', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetTableDdl: (payload: any) => fetchBackend('/api/db/assets/table-ddl', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetQueryTable: (payload: any) => fetchBackend('/api/db/assets/query-table', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetCountTable: (payload: any) => fetchBackend('/api/db/assets/count-table', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetColumnDistinct: (payload: any) => fetchBackend('/api/db/assets/column-distinct', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetDetectPrimaryKey: (payload: any) => fetchBackend('/api/db/assets/detect-pk', { method: 'POST', body: JSON.stringify(payload) }),
    dbAssetExecuteMutations: (payload: any) => fetchBackend('/api/db/assets/mutations', { method: 'POST', body: JSON.stringify(payload) }),
  };

  if (!(window as any).api) {
    (window as any).api = new Proxy(mockApi, {
      get: (target, prop) => {
        if (prop in target) return target[prop];
        return async (...args: any[]) => {
          console.warn(`[Web Bridge] Unimplemented API called: window.api.${String(prop)}`, args);
          return { success: false, ok: false, error: 'Not implemented in web port yet' };
        };
      }
    });
  }

  if (!(window as any).electron) {
    (window as any).electron = {
      ipcRenderer: {
        on: () => {},
        send: () => {},
        invoke: async () => ({})
      }
    };
  }
}
