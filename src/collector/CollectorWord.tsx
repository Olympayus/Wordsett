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
import { ensureWord } from '../lib/ensureWord'
import { collectedLabel, libraryLocationIn } from '../lib/collected'
import { FIELD_LABEL_STYLE } from '../lib/labelStyle'
import { useWordStore } from '../stores/wordStore'
import { setInitialFamiliarity, type InitialFamiliarityChoice } from '../services/wordService'
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
 * 已收录判定读 store 的 `libraryIndex`（工作区 ∪ 储藏库）。Root 在渲染本组件前已经
 * 刷新过索引，故这里的初始值就是准的；订阅式读取让收录成功后新词也能即时反映。
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
        title="关闭"
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

/** 底栏：左提示、右按钮组。三个状态（正常 / 词典未收录 / 已在库）共用这一份几何。 */
function BottomBar({ hint, children }: { hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px',
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

const WORD_HEAD_STYLE: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '21px',
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: '-.01em',
  overflowWrap: 'anywhere',
}

export function CollectorWord({ word }: { word: string }) {
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

  // 已收录判定：订阅索引（工作区 ∪ 储藏库），收录成功后 store 重载索引会即时翻转。
  const location = useWordStore(s => libraryLocationIn(s.libraryIndex, word))
  const alreadyInLibrary = location !== null

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
    if (busyRef.current || alreadyInLibrary || selected.size === 0) return
    const inputs = collectorMergeInputs(fields, selected)
    if (inputs.length === 0) return
    busyRef.current = true
    setBusy(true)
    setCollectError(null)
    try {
      // 落库前再确认一次「不在库」：Root 的索引刷新与本组件的挂载是并行的，
      // 索引还没刷新完时 UI 会把一个既有词显示成可收录。`ensureWord` 只会复用既有
      // 词条、不会拒绝，随后的 `mergeWordFields` 就会把同一批释义再插一遍——
      // 这一步是那个竞态的唯一闸门（T14 的 CollectorExisting 也依赖同一份索引）。
      await useWordStore.getState().reloadLibraryIndex()
      if (libraryLocationIn(useWordStore.getState().libraryIndex, word) !== null) return
      const target = await ensureWord(word)
      if (!target) throw new Error('ensureWord returned null')
      const merged = await useWordStore.getState().mergeWordFields(target.id, inputs)
      if (!merged) throw new Error('mergeWordFields failed')
      // 刚确认过不在库，故这条路一定是新词：熟悉度与搜索返回页同路径、同默认值。
      // 写入失败不阻断收录（字段已落库，缺失只让该词回落 1），与 DictDetailPanel 的取舍一致。
      const wrote = await setInitialFamiliarity(target.id, familiarity)
      if (!wrote) console.error('[collector] 初始熟悉度写入失败')
      // 隐藏失败不该把一次已经落库的收录报成失败（窗口没藏起来只是体验问题）。
      await invoke('collector_hide').catch(e => console.error('[collector] 隐藏小窗失败', e))
    } catch (e) {
      console.error('[collector] 收录失败', e)
      setCollectError('收录失败，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [alreadyInLibrary, selected, fields, word, familiarity])

  // Enter 收录（spec §5.3 底栏键位提示）。焦点在输入类控件或按钮上时不接管：
  // 前者是打字，后者应由原生 Enter 激活那个按钮（否则点过「打开详情页」后按 Enter
  // 会同时触发它和收录）。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || el?.isContentEditable) return
      e.preventDefault()
      void handleCollect()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleCollect])

  // 已在库的判定优先：词典恰好查不到时不该同时冒出「词典未收录」和「已在库」两句话。
  const notFound = !alreadyInLibrary && !loading && !lookupError && groups.length === 0
  const showTree = !alreadyInLibrary && !loading && !lookupError && groups.length > 0

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
          {alreadyInLibrary && (
            <span style={{ alignSelf: 'center', marginLeft: 'auto', fontSize: '12.5px', fontWeight: 600, color: 'var(--color-accent)' }}>
              {collectedLabel(location)}
            </span>
          )}
        </div>

        {/* 已在库态不渲染词典进度：那张卡只需要词头、归属与说明。 */}
        {loading && !alreadyInLibrary && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-text-tertiary)' }}>正在查询…</div>
        )}

        {!alreadyInLibrary && !loading && lookupError && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-danger)' }}>词典查询失败，请重试。</div>
        )}

        {notFound && (
          <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            词典未收录该词，无法收录。
          </div>
        )}

        {alreadyInLibrary && (
          <div style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            这个词已在词库中，本次不重复收录。
          </div>
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

      {alreadyInLibrary || notFound || lookupError ? (
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
