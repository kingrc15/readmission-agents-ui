/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** Same value as READMIT_API_TOKEN in repo .env (embedded in browser bundle — use only for trusted users). */
  readonly VITE_READMIT_API_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
