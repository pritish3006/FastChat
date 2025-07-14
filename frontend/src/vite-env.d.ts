/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_KEY: string
  readonly VITE_ENABLE_MOCK_API: string
  readonly VITE_DEFAULT_MODEL: string
  readonly VITE_DEFAULT_THEME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
