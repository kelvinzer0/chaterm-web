const BACKEND_URL = 'http://localhost:3000';

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
