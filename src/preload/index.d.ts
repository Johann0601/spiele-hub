import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppApi } from './index'

// Damit TypeScript im Renderer weiß, dass es window.api und window.electron gibt.
declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
