import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite baut drei getrennte Bundles: main (Node), preload (Bridge), renderer (React).
// externalizeDepsPlugin sorgt dafür, dass native/Node-Abhängigkeiten (z. B. better-sqlite3)
// NICHT in das Bundle gepackt, sondern zur Laufzeit normal von Node geladen werden.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
