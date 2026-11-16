import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import ErrorBoundary from './components/ui/ErrorBoundary'
import TextContextMenu from './components/ui/TextContextMenu'
import IndexPage from './routes/IndexPage'
import { useUpdaterStore } from './stores/updaterStore'
import { useMobileUpdateStore } from './stores/mobileUpdateStore'
import { usePlatformClass } from './lib/usePlatform'
import { useEditGuard } from './lib/useEditGuard'
import { confirmLeaveEdit } from './lib/editGuard'
import { useViewStore } from './stores/viewStore'
import { useWordStore } from './stores/wordStore'
import { setProbe, type VoiceProbe } from './lib/review/ttsGate'
import { resolveTheme, applyTheme, applyWindowTheme } from './lib/theme'
import { useSettingsStore } from './stores/settingsStore'

export default function App() {
  // 未保存编辑守卫（v0.7.8 Task 6）：失焦确认 + 应用内点击拦截，全应用挂**恰好一次**。
  // 守卫本体是模块级单例（`lib/editGuard.ts`），本 hook 只持两条监听的生命周期。
  useEditGuard()

  // 启动静默检查：发现新版只点亮徽标，不弹窗。
  // 桌面走签名更新器（`useUpdaterStore`），Android（手机 / 平板）读 Releases 清单
  // （`useMobileUpdateStore`）——两条路径互不重叠，桌面行为保持不变。
  const platform = usePlatformClass()
  useEffect(() => {
    if (platform === 'desktop') void useUpdaterStore.getState().checkSilently()
    else void useMobileUpdateStore.getState().checkSilently()
  }, [platform])

  // 划词小窗「打开详情页」（v0.7.9 Task 15）：Rust `collector_open_dict` 先把主窗
  // 置前（含 unminimize），再 emit `open-dict`——**顺序刻意如此**，确认框要弹在已经
  // 可见的主窗里。这里只接一次：dirty 时先过 `confirmLeaveEdit()`（与退出 / 关窗
  // 同一条入口，in-flight 确认框会被复用）；取消则留在原页，小窗已因失焦自行隐藏。
  // 确认后直接用 `openDictFromSearch` 落搜索模块的词典返回页——不必先 `openSearch`。
  // 只在桌面注册：小窗本身就是桌面专属（手机没有全局热键，见 Rust 的 `#[cfg(desktop)]`）。
  useEffect(() => {
    if (platform !== 'desktop') return
    const unlisten = listen('open-dict', e => {
      const word = (e.payload as { word: string }).word
      void confirmLeaveEdit().then(ok => {
        if (ok) useViewStore.getState().openDictFromSearch(word)
      })
    })
    return () => { void unlisten.then(f => f()) }
  }, [platform])

  // 划词小窗收录成功后通知主窗刷新词库（v0.7.9 终审修复）：小窗与主窗是两个 webview，
  // zustand 实例不共享；`loadWords` 会连同 `reloadLibraryIndex` 一起重建当前模块词表、
  // 全库索引与三档计数（与 IndexPage 的启动加载同一入口），不碰编辑态，脏编辑期间也安全。
  // 只在桌面注册：小窗本身就是桌面专属。
  useEffect(() => {
    if (platform !== 'desktop') return
    const unlisten = listen('library-changed', () => {
      void useWordStore.getState().loadWords().catch(e => {
        console.error('[app] 刷新词库失败', e)
      })
    })
    return () => { void unlisten.then(f => f()) }
  }, [platform])

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
      // 状态栏 / 手势条图标跟随应用主题（v0.7.8 Task 9）。桌面端命令为空操作，
      // 非 Tauri 环境（vite dev / vitest）会 reject —— 一律静默，主题本身不受影响。
      void invoke('set_system_bars_theme', { dark: resolved === 'dark' }).catch(() => {})
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
