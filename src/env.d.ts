/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __PRODUCTION_BRANDING__: boolean

interface ImportMetaEnv {
  readonly VITE_TWITCH_CLIENT_ID: string
  readonly VITE_TWITCH_REDIRECT_URI?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
