import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ui/ErrorBoundary'
import TextContextMenu from './components/ui/TextContextMenu'
import IndexPage from './routes/IndexPage'
import { useUpdaterStore } from './stores/updaterStore'
import { setProbe, type VoiceProbe } from './lib/review/ttsGate'
import { resolveTheme, applyTheme, applyWindowTheme } from './lib/theme'
import { useSettingsStore } from './stores/settingsStore'

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
        const result = await invoke<VoiceProbe>('tts_english_voice_available')
        if (alive) setProbe(result)
      } catch {
        // 命令缺失 / 非 Tauri 环境（浏览器里跑 vitest）：按未探测处理，fail-closed。
        if (alive) setProbe(null)
      }
    })()
    return () => { alive = false }
  }, [])

  // 外观（v0.7.3）：theme 三档 → <html data-theme>。
  // 跟随系统时用 window.matchMedia 现读——**不要**在 lib/theme 里另导一个 prefersDark()：
  // 本处的 mq 已经握着同一个 MediaQueryList，多一个导出就多一份「两处判定不一致」的机会。
  // 只在挂载时读一次是不够的：用户切系统主题应用不会跟，故必须 addEventListener('change')。
  const theme = useSettingsStore(s => s.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      const resolved = resolveTheme(theme, mq.matches)
      applyTheme(resolved)
      void applyWindowTheme(resolved)
    }
    sync()
    if (theme !== 'system') return
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [theme])

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
