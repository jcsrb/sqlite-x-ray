import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // Relative base so the static build works under a GitHub Pages project path
  // (https://<user>.github.io/sqlite-x-ray/) without hardcoding the repo name.
  base: './',
  plugins: [svelte()],
  // sql.js is a UMD/CJS module — let Vite pre-bundle it so the `default` export
  // (initSqlJs) is exposed via CJS→ESM interop. The wasm itself is loaded
  // separately through the `?url` import in src/lib/db.ts.
});
