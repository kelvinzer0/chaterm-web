const BACKEND_URL = 'http://localhost:3000'

// WebSocket connection for terminal events
let wsConnection: WebSocket | null = null
const eventHandlers = new Map<string, Array<(data: any) => void>>()

function getWsConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      return resolve(wsConnection)
    }
    const ws = new WebSocket(`ws://${location.hostname}:3000`)
    ws.onopen = () => {
      wsConnection = ws
      resolve(ws)
    }
    ws.onerror = (err) => reject(err)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.event && eventHandlers.has(msg.event)) {
          eventHandlers.get(msg.event)!.forEach((cb) => cb(msg.data))
        }
      } catch (e) {
        console.error('WebSocket message parsing error:', e)
      }
    }
  })
}

function registerEvent(eventName: string, callback: (data: any) => void) {
  if (!eventHandlers.has(eventName)) {
    eventHandlers.set(eventName, [])
  }
  eventHandlers.get(eventName)!.push(callback)
  return () => {
    const handlers = eventHandlers.get(eventName)!
    const index = handlers.indexOf(callback)
    if (index > -1) handlers.splice(index, 1)
  }
}

async function fetchBackend(path: string, options: RequestInit = {}) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })
    return await res.json()
  } catch (err) {
    console.error(`Backend fetch error for ${path}:`, err)
    return { success: false, error: String(err) }
  }
}

export function injectWebBridge() {
  if (typeof window === 'undefined') return

  const mockApi: any = {
    getBrandingConfig: () => fetchBackend('/api/branding-config'),
    getSystemInfo: () => fetchBackend('/api/system/info'),
    getReleaseNotes: () => fetchBackend('/api/release-notes'),
    getVersionPrompt: () => fetchBackend('/api/version-prompt'),

    // Logging
    log: (level: string, message: string, ...args: any[]) => {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[Backend Log] ${message}`, ...args)
    },

    // Auth and Config stubs
    getCookie: async () => ({ success: true, value: '' }),
    setCookie: async () => ({ success: true }),
    getAllCookies: async () => ({ success: true, cookies: [] }),
    removeCookie: async () => ({ success: true }),

    // KV Store (localStorage mapping)
    kvMutate: async (args: any) => {
      const { action, key, value } = args
      if (action === 'set') {
        localStorage.setItem(key, value)
      } else if (action === 'delete') {
        localStorage.removeItem(key)
      }
      return { success: true }
    },
    kvGet: async (args: any) => {
      const key = typeof args === 'string' ? args : args.key
      if (!key) {
        // Return all keys
        const keys = []
        for (let i = 0; i < localStorage.length; i++) {
          keys.push(localStorage.key(i))
        }
        return keys
      }
      const val = localStorage.getItem(key)
      if (!val) return { value: null }
      return { value: val } // key-storage expects result.value
    },
    kvSet: async (args: any) => {
      const key = typeof args === 'string' ? args : args.key
      const value = args.value !== undefined ? args.value : args
      localStorage.setItem(key, JSON.stringify(value))
      return { success: true }
    },
    kvDelete: async (args: any) => {
      const key = typeof args === 'string' ? args : args.key
      localStorage.removeItem(key)
      return { success: true }
    },
    kvGetAll: async () => {
      const all: Record<string, any> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
          try {
            all[key] = JSON.parse(localStorage.getItem(key) || 'null')
          } catch {}
        }
      }
      return all
    },

    // Basic overrides
    getLocalIP: async () => '127.0.0.1',
    getMacAddress: async () => '00:00:00:00:00:00',
    getPlatform: async () => 'web',
    getHomePath: async () => '/home/webuser',

    // Terminal and SSH WS integration
    connectLocal: async (config: any) => {
      try {
        const ws = await getWsConnection()
        ws.send(JSON.stringify({ action: 'connectLocal', config }))
        return { success: true }
      } catch (err) {
        return { success: false, message: String(err) }
      }
    },
    sendDataLocal: async (terminalId: string, data: string) => {
      try {
        const ws = await getWsConnection()
        ws.send(JSON.stringify({ action: 'sendDataLocal', terminalId, data }))
        return { success: true }
      } catch (err) {
        return { success: false, message: String(err) }
      }
    },
    resizeLocal: async (terminalId: string, cols: number, rows: number) => {
      const ws = await getWsConnection()
      ws.send(JSON.stringify({ action: 'resizeLocal', terminalId, cols, rows }))
      return { success: true }
    },
    closeLocal: async (terminalId: string) => {
      const ws = await getWsConnection()
      ws.send(JSON.stringify({ action: 'closeLocal', terminalId }))
      return { success: true }
    },
    onDataLocal: (id: string, callback: (data: string) => void) => {
      return registerEvent(`dataLocal:${id}`, callback)
    },
    onExitLocal: (id: string, callback: (exitCode: unknown) => void) => {
      return registerEvent(`exitLocal:${id}`, callback)
    },

    shell: async (params: any) => {
      const ws = await getWsConnection()
      ws.send(JSON.stringify({ action: 'shell', params }))
      return { id: params.id, success: true }
    },
    writeToShell: async (params: any) => {
      const ws = await getWsConnection()
      ws.send(JSON.stringify({ action: 'writeToShell', params }))
      return { success: true }
    },
    onShellData: (id: string, callback: (data: any) => void) => {
      return registerEvent(`shellData:${id}`, callback)
    },
    onShellClose: (id: string, callback: (data?: any) => void) => {
      return registerEvent(`shellClose:${id}`, callback)
    },
    onShellError: (id: string, callback: (data: any) => void) => {
      return registerEvent(`shellError:${id}`, callback)
    },
    disconnect: async (params: any) => {
      const ws = await getWsConnection()
      ws.send(JSON.stringify({ action: 'disconnect', params }))
      return { success: true }
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

    // Other missing methods from user log
    onMainMessage: () => {},
    onKeyboardInteractiveRequest: () => {},
    onKeyboardInteractiveTimeout: () => {},
    onKeyboardInteractiveResult: () => {},
    onUserSelectionRequest: () => {},
    onUserSelectionTimeout: () => {},
    onTokenExpired: () => {},
    reportPerfMarks: () => {},
    isMaximized: async () => false,
    onMaximized: () => {},
    onUnmaximized: () => {},
    mainWindowShow: async () => {},
    captureButtonClick: async () => {},

    // Host (OrganizationAssets) integration
    getOrganizationAssets: (payload: any) =>
      fetchBackend('/api/hosts/list', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data || []),
    createOrganizationAsset: (payload: any) => fetchBackend('/api/hosts/create', { method: 'POST', body: JSON.stringify(payload) }),
    updateOrganizationAsset: (payload: any) => fetchBackend('/api/hosts/update', { method: 'POST', body: JSON.stringify(payload) }),
    deleteOrganizationAsset: (payload: any) => fetchBackend('/api/hosts/delete', { method: 'POST', body: JSON.stringify(payload) }),
    batchDeleteOrganizationAssets: (payload: any) => fetchBackend('/api/hosts/batch-delete', { method: 'POST', body: JSON.stringify(payload) }),

    // Credentials (KeyChain) integration
    getKeyChainList: () => fetchBackend('/api/credentials/list').then((r) => r.data || []),
    getKeyChainInfo: (payload: any) => fetchBackend('/api/credentials/info', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
    createKeyChain: (payload: any) => fetchBackend('/api/credentials/create', { method: 'POST', body: JSON.stringify(payload) }),
    updateKeyChain: (payload: any) => fetchBackend('/api/credentials/update', { method: 'POST', body: JSON.stringify(payload) }),
    deleteKeyChain: (payload: any) => fetchBackend('/api/credentials/delete', { method: 'POST', body: JSON.stringify(payload) }),

    initUserDatabase: async () => ({ success: true }),

    // Skills integration
    getSkills: async () => [],
    getSkillsUserPath: async () => '/home/webuser/.chaterm/skills',
    onSkillsUpdate: () => {},
    reloadSkills: async () => ({ success: true }),
    openSkillsFolder: async () => ({ success: true })
  }

  // Always override to support HMR
  ;(window as any).api = new Proxy(mockApi, {
    // --- BATCH IMPLEMENTATION STUBS ---
    // Kubernetes
    k8sTerminalCreate: async () => ({ success: false, error: 'K8s not supported in web port' }),
    k8sTerminalClose: async () => ({ success: true }),
    k8sClusterTest: async () => ({ success: false, error: 'K8s not supported in web port' }),

    // MCP
    getMcpServers: async () => [],
    onMcpServerUpdate: () => {},
    onMcpStatusUpdate: () => {},
    setMcpToolState: async () => ({ success: true }),
    toggleMcpServer: async () => ({ success: true }),
    deleteMcpServer: async () => ({ success: true }),
    getAllMcpToolStates: async () => ({}),
    setMcpToolAutoApprove: async () => ({ success: true }),
    getMcpConfigPath: async () => '/home/webuser/.chaterm/mcp.json',
    readMcpConfig: async () => ({ mcpServers: {} }),
    writeMcpConfig: async () => ({ success: true }),
    onMcpConfigFileChanged: () => {},

    // Skills (Extended)
    createSkill: async () => ({ success: true }),
    deleteSkill: async () => ({ success: true }),
    updateSkill: async () => ({ success: true }),
    readSkillContent: async () => '',
    importSkillZip: async () => ({ success: true }),
    exportSkillZip: async () => ({ success: true }),
    setSkillEnabled: async () => ({ success: true }),

    // Knowledge Base & FS
    kbCheckPath: async () => ({ exists: false, isDir: false }),
    kbCreateFile: async () => ({ success: true }),
    kbGetRoot: async () => '/home/webuser/.chaterm/kb',
    kbListDir: async () => [],
    kbReadFile: async () => '',
    kbSetSearchEnabled: async () => ({ success: true }),
    kbWriteFile: async () => ({ success: true }),
    writeLocalFile: async () => ({ success: true }),

    // Folder Organization (LocalStorage mock)
    getCustomFolders: async () => {
      try {
        return JSON.parse(localStorage.getItem('custom_folders') || '[]')
      } catch {
        return []
      }
    },
    createCustomFolder: async (payload: any) => {
      try {
        const folders = JSON.parse(localStorage.getItem('custom_folders') || '[]')
        folders.push({ id: Date.now().toString(), name: payload.name || 'New Folder', assetUuids: [] })
        localStorage.setItem('custom_folders', JSON.stringify(folders))
        return { success: true }
      } catch {
        return { success: false }
      }
    },
    updateCustomFolder: async (payload: any) => ({ success: true }),
    deleteCustomFolder: async (payload: any) => ({ success: true }),
    moveAssetToFolder: async () => ({ success: true }),
    removeAssetFromFolder: async () => ({ success: true }),

    // Tasks & History
    getTaskList: async () => [],
    getTaskMetadata: async () => ({}),
    saveTaskTitle: async () => ({ success: true }),
    saveTaskFavorite: async () => ({ success: true }),
    cancelTask: async () => ({ success: true }),
    gracefulCancelTask: async () => ({ success: true }),
    removeConnectionHistory: async () => ({ success: true }),

    // Host & Bastion Extras
    connect: async () => ({ success: false, error: 'Web SSH not implemented' }),
    connectAssetInfo: async () => null,
    getBastionDefinitions: async () => [],
    getUserHosts: async () => [],
    updateOrganizationAssetComment: async () => ({ success: true }),
    updateOrganizationAssetFavorite: async () => ({ success: true }),

    // Terminal Extras
    insertCommand: async () => ({ success: true }),
    aliasesMutate: async () => ({ success: true }),
    aliasesQuery: async () => [],
    getShellsLocal: async () => [],
    onAlternateScreenEntered: () => {},
    onTuiDetected: () => {},
    onInteractionNeeded: () => {},
    onInteractionClosed: () => {},
    onInteractionSuppressed: () => {},
    cancelInteraction: async () => ({ success: true }),
    dismissInteraction: async () => ({ success: true }),
    submitInteraction: async () => ({ success: true }),
    suppressInteraction: async () => ({ success: true }),
    unsuppressInteraction: async () => ({ success: true }),

    // AI & Chat
    agentEnableAndConfigure: async () => ({ success: true }),
    aiSuggestCommand: async () => ({ command: '' }),
    dbAi: async () => ({}),
    onCommandExplainResponse: () => {},
    onCommandGenerationResponse: () => {},
    chatSyncGetStatus: async () => ({ enabled: false }),
    chatSyncSetAiTabVisible: async () => ({ success: true }),
    chatSyncSetEnabled: async () => ({ success: true }),
    chatSyncSyncNow: async () => ({ success: true }),
    chatermGetChatermMessagesPage: async () => ({ messages: [], total: 0 }),
    setDataSyncEnabled: async () => ({ success: true }),
    stageChatAttachment: async () => ({ success: true }),

    // System & UI
    onSystemThemeChanged: () => {},
    updateTheme: async () => ({ success: true }),
    openExternalUrl: async (url: string) => {
      window.open(url, '_blank')
      return { success: true }
    },
    openSaveDialog: async () => null,
    showOpenDialog: async () => null,
    sendToMain: async () => ({ success: true }),
    dismissVersionPrompt: async () => ({ success: true }),

    // Security & SSH Keys
    addKey: async () => ({ success: true }),
    getSecurityConfigPath: async () => '/home/webuser/.chaterm/security.json',
    readSecurityConfig: async () => ({}),
    writeSecurityConfig: async () => ({ success: true }),
    onSecurityConfigFileChanged: () => {},

    // Settings
    getKeywordHighlightConfigPath: async () => '/home/webuser/.chaterm/highlights.json',
    readKeywordHighlightConfig: async () => ({}),
    writeKeywordHighlightConfig: async () => ({ success: true }),
    onKeywordHighlightConfigFileChanged: () => {},
    kvTransaction: async () => ({ success: true }),

    get: (target, prop) => {
      if (prop in target) return target[prop]
      return async (...args: any[]) => {
        console.warn(`[Web Bridge] Unimplemented API called: window.api.${String(prop)}`, args)
        return { success: false, ok: false, error: 'Not implemented in web port yet' }
      }
    }
  })

  // Always override electron as well
  ;(window as any).electron = {
    ipcRenderer: {
      on: () => {},
      send: () => {},
      invoke: async () => ({})
    }
  }
}
