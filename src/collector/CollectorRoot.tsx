import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getDb, initDatabase } from '../db/connection'
import { dbReadyAction } from '../lib/dbReady'
import { libraryLocationIn } from '../lib/collected'
import { RETRY_WAIT_MS, retrySequence } from '../lib/collectorRetry'
import { applyTheme, applyWindowTheme, resolveTheme } from '../lib/theme'
import { getWordDueStatus } from '../services/wordDue'
import type { WordDueStatus } from '../lib/dueLine'
import { useSettingsStore } from '../stores/settingsStore'
import { useWordStore } from '../stores/wordStore'
import { markGrabCurrent } from './currentGrab'
import { CollectorTitleBar, CollectorWord } from './CollectorWord'
import { CollectorSentence } from './CollectorSentence'
import { CollectorExisting } from './CollectorExisting'
import { CollectorFailure } from './CollectorFailure'
import type { GrabOutcome } from './types'

/**
 * 划词小窗的根（v0.7.9 spec §5.3 / §6.2 / §6.3）。
 *
 * 职责四件，全部与具体形态无关：
 * 1. **交付握手**：挂载时同时订阅 `collector-grab` 并调一次 `collector_ready()`。
 *    两个来源都可能送来同一次抓取（Rust 先填 pending 再 emit），按 `grabId` 去重：
 *    不大于已见值的一律丢弃（spec §5.1-1 的「丢弃旧代」）。
 * 2. **懒连库**：启动时**不**碰数据库。第一次拿到需要库的结果时，先等主窗的
 *    `app-ready`（4s 上限后照常尝试），再 `initDatabase({ ensureSchema: false })`
 *    （schema 的唯一所有者是主窗），失败重试一次，仍失败显示「数据库尚未就绪」。
 *    判据本身来自 Task 7 的纯函数 `dbReadyAction`。
 * 3. **主题**：每次显示（每次接收抓取）重新读 `localStorage` 里的设置并应用
 *    `data-theme` / 原生窗口底色——两个 webview 的 zustand 实例不共享，主窗切深色后
 *    小窗下一次唤起居中生效（spec §6.3）。
 * 4. **窗口高度**：量内容后调 `collector_resize`，Rust 负责 clamp 到工作区。
 *
 * 按状态渲染子树：失败 → `CollectorFailure`（重试 = 焦点回流序列）；单词模式先按
 * `libraryIndex` 分流——已在库 → `CollectorExisting`（不提供收录），否则 → `CollectorWord`；
 * 句子模式 → `CollectorSentence`（它按**当前目标词**再分流已有库 / 新词，见其注释）。
 */

// ---- 模块级状态：StrictMode 在 dev 下会把 effect 跑两遍（卸载再挂载），而
// `collector_ready` 是**取走** pending 的一次性命令——第二个 effect 再调只会拿到 null。
// 把「首次握手」和「等 app-ready」提到模块级，两个挂载周期看到的是同一份结果。

/** 主窗 emit 过 `app-ready`（建库完成）没有。事件是一次性的，错过就只能靠 4s 兜底。 */
let appReadySeen = false
let appReadyWaiters: Array<() => void> = []

function markAppReady(): void {
  appReadySeen = true
  const waiters = appReadyWaiters
  appReadyWaiters = []
  for (const wake of waiters) wake()
}

function waitForAppReady(ms: number): Promise<void> {
  if (appReadySeen) return Promise.resolve()
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      appReadyWaiters = appReadyWaiters.filter(w => w !== finish)
      finish()
    }, Math.max(0, ms))
    appReadyWaiters.push(finish)
  })
}

/** 首次握手（只调一次 `collector_ready`，结果缓存给可能的第二次挂载）。 */
let initialOutcomePromise: Promise<GrabOutcome | null> | null = null

function takeInitialOutcome(): Promise<GrabOutcome | null> {
  if (!initialOutcomePromise) {
    initialOutcomePromise = invoke<GrabOutcome | null>('collector_ready').catch(e => {
      console.error('[collector] 握手失败', e)
      return null
    })
  }
  return initialOutcomePromise
}

/**
 * 懒连库 + 刷新词库索引。
 *
 * `dbReadyAction` 决定「等还是连」；控制器裁定的「失败重试一次」由 `failed` 计数兜底
 * （模块的 `fail` 只表示「已就绪且已失败过」——这里允许它再试一次，第二次失败才放弃）。
 * 成功后顺带 `reloadLibraryIndex()`：小窗的 store 是独立实例，不刷新的话
 * `libraryIndex` 为空，「已在库」态永远不出现，收录还会把既有词当新词再合并一遍。
 * 最终失败时清掉缓存，下一次抓取还有机会重来（失败卡只描述这一次）。
 */
let databasePromise: Promise<boolean> | null = null

function prepareDatabase(): Promise<boolean> {
  if (!databasePromise) {
    databasePromise = openDatabase().then(ok => {
      if (!ok) databasePromise = null
      return ok
    })
  }
  return databasePromise
}

async function openDatabase(): Promise<boolean> {
  const startedAt = Date.now()
  let failed = 0
  for (;;) {
    if (failed >= 2) return false
    const action = dbReadyAction({ appReady: appReadySeen, attempted: failed > 0, elapsedMs: Date.now() - startedAt })
    if (action === 'wait') {
      await waitForAppReady(4000 - (Date.now() - startedAt))
      continue
    }
    try {
      await initDatabase({ ensureSchema: false })
      // `ensureSchema: false` 只连库、不建表，「表还不存在」不会在 initDatabase 里报错。
      // 探一条最小查询，把「主窗还没建完库」变成一次可重试的失败（spec §6.3 的
      // 「表不存在等错误再重试一次」）；否则后面的查询会各自静默回落空结果，
      // 小窗会带着一个空索引照常显示。
      await getDb().select('SELECT 1 FROM words LIMIT 1')
      await useWordStore.getState().reloadLibraryIndex()
      return true
    } catch (e) {
      failed += 1
      console.error('[collector] 数据库尚未就绪', e)
    }
  }
}

// ---- 失败态：文案与「前往系统设置」都收在 `CollectorFailure`（spec §5.1 / §5.3）。 ----

type DbState = 'idle' | 'connecting' | 'ready' | 'failed'

/** 带标题条的简版提示卡：「数据库尚未就绪」与「正在准备…」共用。 */
function NoticeCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <CollectorTitleBar />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '18px 16px 20px' }}>
        <span style={{ fontSize: '13.5px', fontWeight: 600, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{title}</span>
        {detail && (
          <span style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{detail}</span>
        )}
      </div>
    </div>
  )
}

export function CollectorRoot() {
  const [outcome, setOutcome] = useState<GrabOutcome | null>(null)
  const [dbState, setDbState] = useState<DbState>('idle')
  /** 调度状态连同它的词面一起存：换词后的第一帧不会把上一个词的调度行显示给新词。 */
  const [dueFor, setDueFor] = useState<{ word: string; status: WordDueStatus } | null>(null)
  const lastGrabId = useRef(0)
  const dbReady = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastReportedHeight = useRef(0)
  /** 重试进行中：连点「重试」只应触发一次隐藏 / 读取。 */
  const retryingRef = useRef(false)

  // 主题：每次显示都重读持久化设置（spec §6.3）。rehydrate 失败不该挡住显示，
  // 读到的仍是 store 里的现值（zustand 在模块加载时已自动水合过一次）。
  const syncTheme = useCallback(async () => {
    try {
      await useSettingsStore.persist.rehydrate()
    } catch (e) {
      console.error('[collector] 设置读取失败', e)
    }
    const mode = useSettingsStore.getState().theme
    const resolved = resolveTheme(mode, window.matchMedia('(prefers-color-scheme: dark)').matches)
    applyTheme(resolved)
    void applyWindowTheme(resolved)
  }, [])

  const ensureDatabase = useCallback(() => {
    if (dbReady.current) {
      // 已连过：只刷新索引（主窗可能在小窗藏着的这段时间里改过词库），不再等库。
      // 刷新的失败由服务层回落成空表，不把一次已经就绪的连接判死——下一抓会再刷。
      void useWordStore.getState().reloadLibraryIndex()
      setDbState('ready')
      return
    }
    setDbState('connecting')
    void prepareDatabase().then(ok => {
      dbReady.current = ok
      setDbState(ok ? 'ready' : 'failed')
    })
  }, [])

  const accept = useCallback((next: GrabOutcome) => {
    // 旧代丢弃：pending 与事件可能送来同一次抓取，重复的 grabId 也在这里被吃掉。
    if (next.grabId <= lastGrabId.current) return
    lastGrabId.current = next.grabId
    // 写链的隐藏闸门读同一份代际（见 currentGrab.ts）：新一代到达后，旧写链不得再藏窗。
    markGrabCurrent(next.grabId)
    setOutcome(next)
    void syncTheme()
    // 失败态不碰数据库：文案与 × 就够了，连库留给真正要查词的抓取。
    if (next.mode !== 'error') ensureDatabase()
  }, [syncTheme, ensureDatabase])

  // 挂载：先注册监听，再握手取 pending（顺序反了会漏掉两次之间的投递）。
  useEffect(() => {
    let disposed = false
    const unlisteners: UnlistenFn[] = []
    const keep = (un: UnlistenFn) => {
      if (disposed) un()
      else unlisteners.push(un)
    }
    void (async () => {
      try {
        // app-ready 最时间敏感（主窗可能马上就建完库），先挂它，再挂抓取交付。
        keep(await listen('app-ready', () => markAppReady()))
        keep(await listen<GrabOutcome>('collector-grab', e => accept(e.payload)))
        const pending = await takeInitialOutcome()
        if (pending && !disposed) accept(pending)
      } catch (e) {
        console.error('[collector] 抓取事件订阅失败', e)
      }
    })()
    void syncTheme()
    return () => {
      disposed = true
      for (const un of unlisteners) un()
      unlisteners.length = 0
    }
  }, [accept, syncTheme])

  // 内容高度 → 窗口高度（spec §5.3：宽固定 380，高按内容测量后交给 Rust clamp）。
  // 只报整像素、且只在变化时上报：ResizeObserver 在字体加载 / 勾选变化时都会触发。
  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node) return
    const report = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      if (!Number.isFinite(height) || height <= 0 || height === lastReportedHeight.current) return
      lastReportedHeight.current = height
      void invoke('collector_resize', { height }).catch(() => {})
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // 单词模式的「已在库」判定（spec §5.3 / §5.4）：索引含工作区 ∪ 储藏库，
  // 订阅式读取让主窗在小窗藏着的这段时间里改过词库也能即时反映。
  const libraryIndex = useWordStore(s => s.libraryIndex)
  const word = outcome?.mode === 'word' ? outcome.text : null
  const wordLocation = word !== null ? libraryLocationIn(libraryIndex, word) : null

  // 已收录词的复习调度行：只对单词模式预取（句子模式由 CollectorExisting 按目标词自取）。
  // 查询失败由 `getWordDueStatus` 回落为「尚无复习计划」，不会挡住已收录态。
  useEffect(() => {
    if (word === null || wordLocation === null || dbState !== 'ready') {
      setDueFor(null)
      return
    }
    let cancelled = false
    void getWordDueStatus(word, wordLocation)
      .then(status => { if (!cancelled) setDueFor({ word, status }) })
      .catch(e => { console.error('[collector] 复习状态查询失败', e) })
    return () => { cancelled = true }
  }, [word, wordLocation, dbState])

  /** 只把属于当前词面的调度状态交给卡片；换词后的第一帧按「未知」处理（显示占位）。 */
  const due = dueFor !== null && dueFor.word === word ? dueFor.status : null

  /**
   * 「重试」（spec §5.1 的焦点归还）与「小窗已显示时再按热键」共用同一序列：
   * `collector_hide` → 120ms → `grab_now`。Rust 在后台读选区、投递 `collector-grab`
   * 之前自己 `show_at_cursor` —— 前端**不再手动显示**；新结果到达后 `accept` 按
   * `grabId` 换代，组件以新 key 重新挂载（失败则仍显示失败态）。
   */
  const retry = useCallback(() => {
    if (retryingRef.current) return
    retryingRef.current = true
    void (async () => {
      try {
        for (const step of retrySequence()) {
          if (step === 'hide') {
            await invoke('collector_hide').catch(e => console.error('[collector] 隐藏小窗失败', e))
          } else if (step === 'wait') {
            await new Promise<void>(resolve => setTimeout(resolve, RETRY_WAIT_MS))
          } else if (step === 'read') {
            await invoke('grab_now').catch(e => console.error('[collector] 重新读取选区失败', e))
          }
          // `show` 由 Rust 在投递结果前完成（`shortcut::read_and_deliver`）。
        }
      } finally {
        retryingRef.current = false
      }
    })()
  }, [])

  let content: ReactNode = null
  if (outcome) {
    if (outcome.mode === 'error') {
      content = <CollectorFailure error={outcome.error} onRetry={retry} />
    } else if (dbState === 'failed') {
      content = <NoticeCard title="数据库尚未就绪" detail="请稍后重试。" />
    } else if (dbState === 'ready') {
      // key 用 grabId：同一次抓取只挂载一次，换词 / 重新抓取都从干净状态开始
      // （勾选集、熟悉度、错误行都跟着重来）。
      if (outcome.mode === 'sentence') {
        content = <CollectorSentence key={outcome.grabId} outcome={outcome} />
      } else if (wordLocation !== null) {
        content = <CollectorExisting key={outcome.grabId} word={outcome.text} location={wordLocation} due={due} />
      } else {
        content = <CollectorWord key={outcome.grabId} word={outcome.text} grabId={outcome.grabId} onRetry={retry} />
      }
    } else {
      content = <NoticeCard title="正在准备…" />
    }
  }

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', overflowX: 'hidden',
        background: 'var(--color-surface)', color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.5,
      }}
    >
      {content}
    </div>
  )
}
