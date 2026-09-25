import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ui/ErrorBoundary'
import TextContextMenu from './components/ui/TextContextMenu'
import IndexPage from './routes/IndexPage'
import { useUpdaterStore } from './stores/updaterStore'
import { setListenEnabled } from './lib/review/ttsGate'

export default function App() {
  // 启动静默检查：发现新版只点亮顶栏徽标，不弹窗
  useEffect(() => {
    void useUpdaterStore.getState().checkSilently()
  }, [])

  // 启动探测系统是否有英文音色，决定听辨题型是否上线（spec §5.3）。
  // 探测失败 / 命令不存在一律视为不可用——放行的代价是用户抽到播放无声的听辨卡。
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const ok = await invoke<boolean>('tts_english_voice_available')
        if (alive) setListenEnabled(ok === true)
      } catch {
        if (alive) setListenEnabled(false)
      }
    })()
    return () => { alive = false }
  }, [])

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<IndexPage />} />
        </Routes>
        {/* 全局右键处理：禁止浏览器默认菜单 + 输入框自定义复制/粘贴菜单（v0.4.3 §3） */}
        <TextContextMenu />
      </ErrorBoundary>
    </BrowserRouter>
  )
}
