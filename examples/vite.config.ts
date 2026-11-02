import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // `npm run dev` reads the packages' source directly (instant HMR, no rebuild);
  // `npm run build` resolves the built dist/ exactly like an npm consumer would.
  resolve:
    command === 'serve'
      ? {
          alias: {
            '@cortexlabs/auditory-cortex-r3f': src('../packages/r3f/src/index.ts'),
            '@cortexlabs/auditory-cortex': src('../packages/core/src/index.ts'),
          },
        }
      : {},
  base: './',
}))
