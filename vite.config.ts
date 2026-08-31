import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'
import pkg from './package.json'

const publicDir = resolve('resources')
const envDir = resolve('build')

type Edition = 'cn' | 'global'

interface EditionConfig {
  edition: Edition
  displayName: string
  branding?: {
    enterpriseBrandingEnabled?: boolean
    productNameZh?: string
    productNameEn?: string
  }
  api: {
    baseUrl: string
    kmsUrl: string
    syncUrl: string
  }
  update: {
    serverUrl: string
    releaseNotesUrl: string
  }
  auth: {
    loginBaseUrl: string
  }
  defaults: {
    language: string
  }
  legal: {
    privacyPolicyUrl: string
    termsOfServiceUrl: string
  }
  speech: {
    wsUrl: string
  }
  docs: {
    baseUrl: string
  }
}

const loadEditionConfig = (edition: Edition): EditionConfig => {
  const configPath = resolve(`build/edition-config/${edition}.json`)
  try {
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as EditionConfig
  } catch (error) {
    throw new Error(`Edition config not found for: ${edition}`)
  }
}

const resolveEdition = (mode: string | undefined): Edition => {
  if (process.env.APP_EDITION === 'cn' || process.env.APP_EDITION === 'global') {
    return process.env.APP_EDITION
  }
  if (mode?.endsWith('.cn')) return 'cn'
  if (mode?.endsWith('.global')) return 'global'
  return 'cn'
}

export default defineConfig(({ mode }) => {
  const resolvedMode = mode || 'development'
  const edition = resolveEdition(resolvedMode)
  const editionConfig = loadEditionConfig(edition)
  const env = loadEnv(resolvedMode, envDir, 'RENDERER_')
  const proxyTarget = env.RENDERER_VUE_APP_API_BASEURL || editionConfig.api.baseUrl
  const isDev = resolvedMode.startsWith('development')
  const enableSourcemap = isDev || process.env.ENABLE_SOURCEMAP === 'true'

  return {
    publicDir,
    envDir,
    envPrefix: 'RENDERER_',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@views': resolve('src/renderer/src/views'),
        '@router': resolve('src/renderer/src/router'),
        '@store': resolve('src/renderer/src/store'),
        '@utils': resolve('src/renderer/src/utils'),
        '@api': resolve('src/renderer/src/api'),
        '@config': resolve('src/renderer/src/config'),
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/backend_reference/agent/shared'),
        '@common': resolve('src/shared')
      }
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    optimizeDeps: {
      include: [
        'monaco-editor',
        'monaco-editor/esm/vs/editor/editor.all.js',
        'monaco-editor/esm/vs/basic-languages/shell/shell.contribution',
        'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution',
        'monaco-editor/esm/vs/basic-languages/python/python.contribution',
        'monaco-editor/esm/vs/basic-languages/go/go.contribution',
        'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
      ]
    },
    build: {
      sourcemap: enableSourcemap,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          if (warning.message?.includes('dynamically imported by') && warning.message?.includes('but also statically imported by')) {
            return
          }
          defaultHandler(warning)
        }
      }
    },
    plugins: [
      vue(),
      Components({
        resolvers: [
          AntDesignVueResolver({
            importStyle: false // Use CSS in JS
          })
        ]
      }),
      AutoImport({
        imports: [
          {
            '@/utils/logger': ['createRendererLogger']
          }
        ],
        dts: resolve('src/renderer/auto-imports.d.ts'),
        resolvers: [AntDesignVueResolver()]
      })
    ],
    define: {
      __APP_INFO__: JSON.stringify({ version: pkg.version }),
      __EDITION_CONFIG__: JSON.stringify(editionConfig),
      'import.meta.env.RENDERER_APP_EDITION': JSON.stringify(edition)
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true
        }
      }
    }
  }
})
