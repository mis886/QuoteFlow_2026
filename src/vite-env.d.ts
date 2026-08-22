/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_S3_REGION: string
  readonly VITE_S3_BUCKET: string
  readonly VITE_S3_ACCESS_KEY_ID: string
  readonly VITE_S3_SECRET_ACCESS_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
