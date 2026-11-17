import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Icon from '../components/icons'
import { Button } from '../components/ui/Button'
import SpeakButton from '../components/ui/SpeakButton'
import FamiliarityChoice from '../components/search/FamiliarityChoice'
import { CollectorTree } from './CollectorTree'
import { lookupTitleMeta, lookupWord } from '../services/searchService'
import { collectorMergeInputs, definitionGroups, leafKeys } from '../lib/collectorTree'
import { toggleSubtreeSelection } from '../lib/dictPlan'
import { FIELD_LABEL_STYLE } from '../lib/labelStyle'
import type { InitialFamiliarityChoice } from '../services/wordService'
import { collectNewWord } from './collectNewWord'
import { CollectorFailure } from './CollectorFailure'
import type { TitleMeta } from '../providers/titleMeta'
import type { DictionaryField } from '../types/dictionary'

/**
 * 单词模式的快速收录卡（v0.7.9 spec §5.3 / §5.4）。
 *
 * 三段固定结构：标题条（拖动 / ×）→ 头行（词 + 音标 + 喇叭）与释义树 / 初始熟悉度 →
 * 底栏（Enter 提示 + 打开详情页 + 收录）。数据只做两件事：`lookupWord`（释义树）与
 * `lookupTitleMeta`（音标），收录走与搜索返回页**逐字同源**的三步：
 * `ensureWord` → `mergeWordFields` → 新词 `setInitialFamiliarity`。
 *
 * 已收录判定不在这里：Root 在渲染本组件前按 `libraryIndex` 路由，已在库的词走
 * `CollectorExisting`，本组件只处理「新词」（写链内部仍会复核一次，防索引刷新竞态）。
 * 词典未收录复用 `CollectorFailure` 的同一卡形。
 *
 * 本文件同时导出 `CollectorTitleBar`：Root 的失败 / 句子占位卡也要同一条可拖动标题条，
 * 三处各画一份迟早会漂（T13/T14 的组件也直接复用它）。单词模式是本任务的正文，
 * 标题条先落在这里。
 */

/** 标题条高度（spec §5.3）。 */
export const COLLECTOR_TITLE_BAR_HEIGHT = 30

/**
 * 无边框小窗的标题条：整条可拖（`core:window:allow-start-dragging`），左「划词」、右 ×。
 *
 * `data-tauri-drag-region` 只认**命中的那个元素自身**，故除了条本身，左端文字与
 * 文字右侧的弹性空白也各自盖上这个属性——否则按在文字上拖不动窗口。
 */
export function CollectorTitleBar() {
  return (
    <div
      data-tauri-drag-region
      style={{
        height: `${COLLECTOR_TITLE_BAR_HEIGHT}px`, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        // 内容超过窗口最大高度时（CollectorRoot 的滚动根），标题条吸顶——× 与拖动区
        // 不随释义树滚走。
        position: 'sticky', top: 0, zIndex: 2,
        padding: '0 6px 0 12px', boxSizing: 'border-box',
        background: 'var(--color-chrome)', borderBottom: '1px solid var(--color-border)',
        userSelect: 'none',
      }}
    >
      <div data-tauri-drag-region style={{ flex: 1, alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          data-tauri-drag-region
          style={{
            fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.1em',
            color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap',
          }}
        >
          划词
        </span>
      </div>
      <button
        type="button"
        aria-label="关闭"
        onClick={() => { void invoke('collector_hide').catch(() => {}) }}
        style={{
          width: '24px', height: '24px', flexShrink: 0, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', color: 'var(--color-text-secondary)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}

/** 底栏：左提示、右按钮组。三个状态（正常 / 词典未收录 / 已在库）共用这一份几何。
 *  T13 的句子模式也复用它（同一份几何、同一条 chrome 面）。 */
export function BottomBar({ hint, children }: { hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px',
        // 与标题条同理：滚动态下「打开详情页 / 收录」始终留在底边。
        position: 'sticky', bottom: 0, zIndex: 2,
        padding: '8px 12px', boxSizing: 'border-box',
        background: 'var(--color-chrome)', borderTop: '1px solid var(--color-border)',
      }}
    >
      {hint && <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{hint}</span>}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {children}
      </span>
    </div>
  )
}

/** 词头字形（Literata 600 / 21px）。T13 的「词典未收录」卡也用同一枚词头。 */
export const WORD_HEAD_STYLE: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '21px',
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: '-.01em',
  overflowWrap: 'anywhere',
}

export function CollectorWord({ word, grabId, onRetry }: { word: string; grabId: number; onRetry: () => void }) {
  const [fields, setFields] = useState<DictionaryField[]>([])
  const [meta, setMeta] = useState<TitleMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [lookupError, setLookupError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>())
  const [familiarity, setFamiliarity] = useState<InitialFamiliarityChoice>(1)
  const [busy, setBusy] = useState(false)
  const [collectError, setCollectError] = useState<string | null>(null)
  // 同步闸门：Enter 与「收录」按钮可能在同一毫秒各触发一次（按钮聚焦时按 Enter，
  // 原生 click 与 window keydown 都会到达），ref 比 state 早一个渲染周期。
  const busyRef = useRef(false)

  const groups = useMemo(() => definitionGroups(fields).filter(g => g.leaves.length > 0), [fields])
  const allKeys = useMemo(() => leafKeys(groups), [groups])

  // 默认全选（spec §5.3）。字段变化（新词 / 重新查询）时重置——勾选键来自上一棵树的
  // 话，轻则全不选、重则把旧词的键带进 `collectorMergeInputs`。
  // 用 layout effect：树第一次出现的同一帧就带上全选，不让用户看见「全空 → 全选」的跳变。
  useLayoutEffect(() => { setSelected(new Set(allKeys)) }, [allKeys])

  // 释义树与音标并行拉取。音标是增量信息，失败静默（与 DictDetailPanel 同策）。
  useEffect(() => {
    let cancelled = false
    setFields([])
    setLoading(true)
    setLookupError(false)
    setCollectError(null)
    lookupWord(word)
      .then(r => { if (!cancelled) setFields(r) })
      .catch(e => { console.error('[collector] 词典查询失败', e); if (!cancelled) setLookupError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    lookupTitleMeta(word)
      .then(m => { if (!cancelled) setMeta(m) })
      .catch(() => { if (!cancelled) setMeta(null) })
    return () => { cancelled = true }
  }, [word])

  const handleToggle = useCallback((key: string) => {
    setSelected(prev => toggleSubtreeSelection(prev, allKeys, key))
  }, [allKeys])

  const openDict = useCallback(() => {
    void invoke('collector_open_dict', { word }).catch(e => console.error('[collector] 打开详情页失败', e))
  }, [word])

  const handleCollect = useCallback(async () => {
    if (busyRef.current || selected.size === 0) return
    const inputs = collectorMergeInputs(fields, selected)
    if (inputs.length === 0) return
    busyRef.current = true
    setBusy(true)
    setCollectError(null)
    try {
      // 共用写链（`collectNewWord`）：落库前复核「不在库」→ ensureWord → merge →
      // 初始熟悉度（新词）→ 仍属当前代抓取时隐藏小窗。已在库的竞态由写链内的复核兜住。
      const result = await collectNewWord({ word, inputs, familiarity, grabId })
      if (result === 'failed') setCollectError('收录失败，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [selected, fields, word, familiarity, grabId])

  // Enter 收录（spec §5.3 底栏键位提示）。只有文本输入类控件豁免（打字 / 输入法）：
  // 勾选框、熟悉度、按钮都是 `<button>`，聚焦后按 Enter 仍应触发收录——若把 BUTTON
  // 一并排除，用户点过勾选框再按 Enter 会去「原生激活那个复选框」，把刚做的勾选翻回去。
  // 原生激活由下面的 `preventDefault` 拦掉；「收录」按钮自己的 click 与这条路径重复时，
  // 由 `busyRef` 同步闸门兜住。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      e.preventDefault()
      void handleCollect()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleCollect])

  const notFound = !loading && !lookupError && groups.length === 0
  const showTree = !loading && !lookupError && groups.length > 0

  // 词典未收录：复用失败卡（同一卡形、只给「打开详情页」与「重试」两个出口）。
  // 「已在库」不会走到这里——Root 已经按索引把这种词路由到 `CollectorExisting`。
  if (notFound) {
    return (
      <CollectorFailure
        error={null}
        kindOverride="not_found"
        onRetry={onRetry}
        onOpenDict={openDict}
        word={word}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <CollectorTitleBar />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px 14px' }}>
        {/* 头行：词 + 音标 + 喇叭（spec §5.3）。音标取回前不占位。 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={WORD_HEAD_STYLE}>{word}</span>
          {meta?.phonetic && (
            <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              /{meta.phonetic}/
            </span>
          )}
          <span style={{ alignSelf: 'center', display: 'inline-flex' }}>
            <SpeakButton text={word} size={16} />
          </span>
        </div>

        {loading && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-text-tertiary)' }}>正在查询…</div>
        )}

        {!loading && lookupError && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-danger)' }}>词典查询失败，请重试。</div>
        )}

        {showTree && (
          <>
            <CollectorTree groups={groups} selected={selected} onToggle={handleToggle} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '2px' }}>
              <span style={FIELD_LABEL_STYLE}>初始熟悉度</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
                <FamiliarityChoice value={familiarity} onChange={setFamiliarity} disabled={busy} />
              </span>
            </div>
          </>
        )}

        {collectError && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-danger)' }}>{collectError}</div>
        )}
      </div>

      {lookupError ? (
        <BottomBar>
          <Button variant="secondary" onClick={openDict}>打开详情页</Button>
        </BottomBar>
      ) : (
        <BottomBar hint={showTree ? 'Enter 收录' : undefined}>
          <Button variant="secondary" onClick={openDict}>打开详情页</Button>
          <Button
            onClick={() => { void handleCollect() }}
            disabled={busy || !showTree || selected.size === 0}
          >
            收录
          </Button>
        </BottomBar>
      )}
    </div>
  )
}
