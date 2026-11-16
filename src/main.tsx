import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { emit } from '@tauri-apps/api/event'
import { initDatabase } from './db/connection'
import './index.css'
import App from './App.tsx'
import { CollectorRoot } from './collector/CollectorRoot.tsx'

// v0.7.9：同一个 index.html 承载主窗与预载的划词小窗，靠查询参数分流。
const isCollector = new URLSearchParams(window.location.search).get('window') === 'collector'

if (isCollector) {
  // 小窗不建库、不装路由：Task 12 的 CollectorRoot 会在需要时懒初始化。
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CollectorRoot />
    </StrictMode>,
  )
} else {
  initDatabase().then(() => {
    // 通知预载的小窗：schema 已就绪，可以连库了。
    emit('app-ready').catch(console.error)
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }).catch(console.error)
}
