import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getDb, initDatabase } from '../db/connection'
import { dbReadyAction } from '../lib/dbReady'
import { applyTheme, applyWindowTheme, resolveTheme } from '../lib/theme'
import { useSettingsStore } from '../stores/settingsStore'
import { useWordStore } from '../stores/wordStore'
import { CollectorTitleBar, CollectorWord } from './CollectorWord'
import { CollectorSentence } from './CollectorSentence'
import type { GrabErrorKind, GrabOutcome } from './types'

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
 * 按状态渲染子树：失败 → 简版失败卡（Task 14 换成 `CollectorFailure`）；句子模式 →
 * `CollectorSentence`（目标词候选、释义树与例句归属全部由它自己装载）；单词 →
 * `CollectorWord`（含词典未收录 / 已在库两种内联态）。
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

// ---- 失败文案：前端按 kind 决定（spec §5.1），os 用 Rust 给的 detail。 ----

interface FailureCopy { title: string; detail: string }

function failureCopy(outcome: GrabOutcome): FailureCopy {
  const error = outcome.error
  // 契约上 error 模式的 error 一定非空；防御到一个兜底文案，避免出现空白卡。
  const kind: GrabErrorKind = error?.kind ?? 'os'
  switch (kind) {
    case 'empty': return { title: '未检测到选中文本', detail: '请先选中文本，再按热键。' }
    case 'unsupported': return { title: '当前应用不支持读取选区', detail: '该应用没有提供可读取的文本选区。' }
    case 'denied': return { title: '没有读取选区的权限', detail: '请在系统设置中授予辅助功能权限后再试。' }
    case 'timeout': return { title: '读取选区超时', detail: '请重试。' }
    case 'too_long': return { title: '选区过长', detail: `选区包含 ${outcome.tokens} 个词，请缩小选区后重试。` }
    case 'os': return { title: '读取选区时发生错误', detail: error?.detail || '系统返回了未知错误。' }
  }
}

type DbState = 'idle' | 'connecting' | 'ready' | 'failed'

/** 一张带标题条的简版提示卡：失败态与「数据库尚未就绪」共用（Task 14 会接管失败卡）。 */
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
  const lastGrabId = useRef(0)
  const dbReady = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastReportedHeight = useRef(0)

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

  let content: ReactNode = null
  if (outcome) {
    if (outcome.mode === 'error') {
      const copy = failureCopy(outcome)
      content = <NoticeCard title={copy.title} detail={copy.detail} />
    } else if (dbState === 'failed') {
      content = <NoticeCard title="数据库尚未就绪" detail="请稍后重试。" />
    } else if (dbState === 'ready') {
      // key 用 grabId：同一次抓取只挂载一次，换词 / 重新抓取都从干净状态开始
      // （勾选集、熟悉度、错误行都跟着重来）。
      content = outcome.mode === 'sentence'
        ? <CollectorSentence key={outcome.grabId} outcome={outcome} />
        : <CollectorWord key={outcome.grabId} word={outcome.text} />
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
