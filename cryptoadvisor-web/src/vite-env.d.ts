/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_MOCK_DELAY_MS: string
  readonly VITE_CMS_URL: string
  readonly VITE_LIVE_PRICES: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
