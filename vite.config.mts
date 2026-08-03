import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const assetSalt = process.env.VITE_ASSET_SALT || ''

const saltedOutput = {
  entryFileNames: `assets/[name]-${assetSalt}[hash].js`,
  chunkFileNames: `assets/[name]-${assetSalt}[hash].js`,
  assetFileNames: `assets/[name]-${assetSalt}[hash][extname]`,
}

// https://vitejs.dev/config/
export default defineConfig({
  // Served under a sub-path when embedded (VITE_BASE_PATH=/dribble/); '/' standalone.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tsconfigPaths(), nodePolyfills({ include: ['events'] })],
  // Optional cache-bust salt (VITE_ASSET_SALT). Output filenames are CONTENT hashes, so a
  // change to the *headers* we serve an asset with can't change its name — and these assets
  // go out `immutable, max-age=31536000`. Any browser that cached one under a bad header
  // (e.g. a CSP missing 'wasm-unsafe-eval', which silently breaks the WASM parse worker)
  // would keep replaying that response for a year. Bumping the salt renames every asset, so
  // index.html (which must stay no-cache) points at fresh files and clients self-heal.
  build: {
    rollupOptions: { output: saltedOutput },
  },
  // Workers go through their OWN rollup config — build.rollupOptions does not reach them.
  // This one matters most: the demo parser runs in a worker, and a worker inherits the CSP
  // of the response that served its script, so ParseWorker.js is exactly the file a bad
  // cached header breaks.
  worker: {
    rollupOptions: { output: saltedOutput },
  },
})
