import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '../components/ui/Button'
import { getWordFreqs } from '../services/lemmaFreq'
import { lookupWord } from '../services/searchService'
import { appendExampleUnderDefinition } from '../services/wordService'
import { ensureWord } from '../lib/ensureWord'
import { contentCandidates, pickDefaultTarget, tokenize, type TargetCandidate } from '../lib/collectorTarget'
import {
  collectorMergeInputs,
  definitionGroups,
  leafKeys,
  type DefinitionGroup,
  type DefinitionLeaf,
} from '../lib/collectorTree'
import { toggleSubtreeSelection } from '../lib/dictPlan'
import { FIELD_LABEL_STYLE } from '../lib/labelStyle'
import type { DictionaryField } from '../types/dictionary'
import { CollectorTree } from './CollectorTree'
import { BottomBar, WORD_HEAD_STYLE } from './CollectorWord'
import { collectNewWord } from './collectNewWord'
import { isGrabCurrent } from './currentGrab'
import type { GrabOutcome } from './types'

/**
 * 句子模式的共用视图（v0.7.9 Task 13/14）。
 *
 * Task 13 把「候选 → 目标词 → 释义树 → 归属」全部写进 `CollectorSentence`；Task 14
 * 的已在库态（`CollectorExisting`）需要同一套目标词行与释义树，故把可复用的三块
 * 抽到这里，两个入口只决定「当前目标词在不在库」以及底部动作：
 *
 * - `useSentenceTargets`：候选装载（一次算定、换词不重排）与每个目标词的字段查询；
 * - `useDefinitionSelection`：勾选集 + 「整句归入哪个释义」的约束关系；
 * - `SentenceCard` / `TargetRow`：句子卡与数字键胶囊；
 * - `NewSentenceBody` / `ExistingSentenceBody`：两种底栏动作的正文。
 *
 * 本文件不 import 两个入口组件，入口之间也不互相 import（只在 CollectorSentence
 * 里单向使用 CollectorExisting），避免组件模块循环依赖。
 */

const EMPTY_FIELDS: DictionaryField[] = []

const SENTENCE_CARD_STYLE: CSSProperties = {
  background: 'var(--color-surface-sunken)',
  borderRadius: '8px',
  padding: '9px 11px',
  fontSize: '13px',
  lineHeight: 1.6,
  overflowWrap: 'anywhere',
}

const MARK_STYLE: CSSProperties = {
  background: 'var(--color-brand-soft)',
  borderRadius: '3px',
  padding: '0 2px',
  fontWeight: 600,
}

const TARGETS_STYLE: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
}

const CHIP_STYLE: CSSProperties = {
  display: 'inline-flex', alignItems: 'baseline', gap: '4px',
  padding: '2px 9px', borderRadius: 'var(--radius-full)',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)',
  fontSize: '12px', lineHeight: 1.5, cursor: 'pointer', whiteSpace: 'nowrap',
}

/** 胶囊里的数字键：只显示序号，绝不渲染词频（未知词频是 `Infinity` 哨兵）。 */
const CHIP_NUMBER_STYLE: CSSProperties = {
  fontSize: '10.5px', color: 'var(--color-text-tertiary)',
}

const ATTACH_HEAD_STYLE: CSSProperties = {
  ...FIELD_LABEL_STYLE,
  padding: '6px 10px',
  background: 'var(--color-surface-sunken)',
  borderBottom: '1px solid var(--color-border)',
}

const ATTACH_ROW_STYLE: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
  padding: '6px 10px', border: 'none', background: 'transparent',
  color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
  fontSize: '12.5px', lineHeight: 1.5, textAlign: 'left', cursor: 'pointer',
}

const RADIO_STYLE: CSSProperties = {
  width: '13px', height: '13px', flexShrink: 0, position: 'relative',
  borderRadius: 'var(--radius-full)', border: '1.5px solid var(--color-border-strong)',
}

const RADIO_DOT_STYLE: CSSProperties = {
  position: 'absolute', inset: '2.5px',
  borderRadius: 'var(--radius-full)', background: 'var(--color-brand)',
}

const LOADING_STYLE: CSSProperties = { fontSize: '12.5px', color: 'var(--color-text-tertiary)' }
const ERROR_STYLE: CSSProperties = { fontSize: '12.5px', color: 'var(--color-danger)' }
const NOTE_STYLE: CSSProperties = { fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }

/** 整句里给目标词加 `<mark>`：大小写不敏感，且只命中完整 token（不吃掉更长单词的一段）。 */
function highlightSentence(text: string, word: string | null): ReactNode[] {
  if (!word) return [text]
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(escaped, 'giu')
  const isTokenChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}'-]/u.test(ch)
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  for (;;) {
    const match = pattern.exec(text)
    if (!match) break
    const start = match.index
    const end = start + match[0].length
    // 前后都必须是 token 边界，`ephemeral` 才不会在高亮 `ephemeral` 时误中 `ephemerally`。
    if (!isTokenChar(text[start - 1]) && !isTokenChar(text[end])) {
      if (start > last) nodes.push(text.slice(last, start))
      nodes.push(<mark key={key++} style={MARK_STYLE}>{match[0]}</mark>)
      last = end
    }
    if (match[0].length === 0) pattern.lastIndex += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/**
 * 「整句归入哪个释义」的默认值：第一条中文释义（按树的顺序），没有中文时退回第一条。
 *
 * `definitionGroups` 已把每组的中文排在英文之前，故「第一条中文」＝第一个含中文的组的
 * 第一枚叶子。
 */
function defaultAttachKey(groups: DefinitionGroup[]): string | null {
  for (const group of groups) {
    const zh = group.leaves.find(leaf => leaf.label === '中文释义')
    if (zh) return zh.key
  }
  return groups[0]?.leaves[0]?.key ?? null
}

export interface SentenceView {
  candidates: TargetCandidate[] | null
  target: TargetCandidate | null
  targetWord: string | null
  fields: DictionaryField[]
  groups: DefinitionGroup[]
  allKeys: string[]
  loading: boolean
  lookupError: boolean
  switchTarget: (index: number) => void
  /** 同步写闸门：Enter 与按钮可能在同一毫秒各触发一次；换目标也读它。 */
  busyRef: { current: boolean }
}

/**
 * 句子的候选表 + 当前目标词 + 该词的字段树。
 *
 * `initial` 供 `CollectorExisting` 使用：它在挂载时已经知道目标词与父级查好的字段，
 * 不必再查一次；`CollectorSentence` 不传，行为与 Task 13 逐字相同。
 */
export function useSentenceTargets(
  outcome: GrabOutcome,
  initial?: { target: string; fields: DictionaryField[] },
): SentenceView {
  const initialTarget = initial?.target ?? null
  const initialFields = initial?.fields ?? null

  const [candidates, setCandidates] = useState<TargetCandidate[] | null>(null)
  const [target, setTarget] = useState<TargetCandidate | null>(() =>
    initialTarget === null ? null : { word: initialTarget, freq: Number.POSITIVE_INFINITY })
  const [result, setResult] = useState<{ word: string; fields: DictionaryField[] } | null>(() =>
    initialTarget === null || initialFields === null
      ? null
      : { word: initialTarget, fields: initialFields })
  /** 查询失败的那个词面；与 `targetWord` 比较后才算当前目标的错误。 */
  const [failureWord, setFailureWord] = useState<string | null>(null)
  const busyRef = useRef(false)

  // 父级换了初始目标（句子模式里在两个**已在库**的词之间切换）：立刻把目标切过去，
  // 不等候选表重算，避免这一帧仍显示上一个词的归属 / 调度行。
  useEffect(() => {
    if (initialTarget === null) return
    setTarget(prev => (prev?.word === initialTarget
      ? prev
      : { word: initialTarget, freq: Number.POSITIVE_INFINITY }))
  }, [initialTarget])

  // 候选只在挂载时（或换了一次抓取）算一次：词频异步补齐后排序落定，此后换词只改 target。
  useEffect(() => {
    let cancelled = false
    setCandidates(null)
    void getWordFreqs(tokenize(outcome.text)).then(freqs => {
      if (cancelled) return
      let list = contentCandidates(outcome.text, w => freqs.get(w.toLowerCase()))
      if (initialTarget !== null && !list.some(c => c.word === initialTarget)) {
        // 防御：初始目标理论上来自同一份候选表；万一不在（大小写 / 过滤规则变化），
        // 也要让目标词行里有一枚可对应的胶囊，否则切不回它。
        list = [{ word: initialTarget, freq: Number.POSITIVE_INFINITY }, ...list].slice(0, 9)
      }
      setCandidates(list)
      setTarget(initialTarget === null
        ? pickDefaultTarget(list)
        : list.find(c => c.word === initialTarget) ?? null)
    })
    return () => { cancelled = true }
  }, [outcome.text, initialTarget])

  const targetWord = target?.word ?? null

  // 目标词的释义树：每换一个词查一次；失败记在该词面下，换词后自然失效。
  useEffect(() => {
    if (!targetWord) return
    // 初始目标：父级已经查过（非空）就直接用；父级还没查回 / 查回空时自己查一次，
    // 这样已在库卡的释义树不依赖父组件的查询结果，父级稍后给出字段时再同步一次。
    if (initialTarget !== null && targetWord === initialTarget && initialFields !== null && initialFields.length > 0) {
      setResult({ word: initialTarget, fields: initialFields })
      setFailureWord(null)
      return
    }
    let cancelled = false
    // 新一次查询开始即清掉上一个词面的失败标记；成功时再清一次，避免切回同一词面时
    // 旧失败把新结果盖住（`failureWord === targetWord` 的判据）。
    setFailureWord(null)
    lookupWord(targetWord)
      .then(fields => {
        if (cancelled) return
        setResult({ word: targetWord, fields })
        setFailureWord(null)
      })
      .catch(e => {
        console.error('[collector] 词典查询失败', e)
        if (!cancelled) setFailureWord(targetWord)
      })
    return () => { cancelled = true }
  }, [targetWord, initialTarget, initialFields])

  // 结果只对产生它的词面有效：换词后的首次渲染立刻回到「查询中」，不会闪一帧旧树。
  const fields = result && result.word === targetWord ? result.fields : EMPTY_FIELDS
  const lookupError = targetWord !== null && failureWord === targetWord
  const loading = targetWord !== null && !lookupError && !(result && result.word === targetWord)

  const groups = useMemo(() => definitionGroups(fields).filter(g => g.leaves.length > 0), [fields])
  const allKeys = useMemo(() => leafKeys(groups), [groups])

  const switchTarget = useCallback((index: number) => {
    if (busyRef.current) return
    const next = candidates?.[index]
    if (next) setTarget(next)
  }, [candidates])

  return {
    candidates, target, targetWord, fields, groups, allKeys,
    loading, lookupError, switchTarget, busyRef,
  }
}

export interface DefinitionSelection {
  selected: Set<string>
  attachKey: string | null
  toggle: (key: string) => void
  chooseAttach: (key: string) => void
}

/**
 * 勾选集 + 「整句归入哪个释义」。
 *
 * 归属释义必须始终在选中集里：它是例句的父级，取消它会让例句悬空。词面变化（新词 /
 * 换目标）时重置为全选 + 默认归属——用 layout effect，树第一次出现的同一帧就带上，
 * 不让用户看见「全空 → 全选」的跳变。
 */
export function useDefinitionSelection(groups: DefinitionGroup[], allKeys: string[]): DefinitionSelection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>())
  const [attachKey, setAttachKey] = useState<string | null>(null)

  useLayoutEffect(() => {
    setSelected(new Set(allKeys))
    setAttachKey(defaultAttachKey(groups))
  }, [groups, allKeys])

  const toggle = useCallback((key: string) => {
    setSelected(prev => {
      const next = toggleSubtreeSelection(prev, allKeys, key)
      if (attachKey && !next.has(attachKey)) next.add(attachKey)
      return next
    })
  }, [allKeys, attachKey])

  const chooseAttach = useCallback((key: string) => {
    setAttachKey(key)
    setSelected(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
  }, [])

  return { selected, attachKey, toggle, chooseAttach }
}

/** 按路径键取归属叶子（`appendExampleUnderDefinition` 需要它的标签与值）。 */
export function attachLeafOf(groups: DefinitionGroup[], key: string | null): DefinitionLeaf | null {
  if (key === null) return null
  for (const group of groups) {
    const leaf = group.leaves.find(l => l.key === key)
    if (leaf) return leaf
  }
  return null
}

export function SentenceCard({ text, word }: { text: string; word: string | null }) {
  return <div style={SENTENCE_CARD_STYLE}>{highlightSentence(text, word)}</div>
}

export function TargetRow({ view }: { view: SentenceView }) {
  return (
    <div style={TARGETS_STYLE}>
      <span style={{ ...FIELD_LABEL_STYLE, marginRight: '2px' }}>目标词</span>
      {(view.candidates ?? []).map((candidate, i) => {
        const active = candidate.word === view.targetWord
        return (
          <button
            key={candidate.word}
            type="button"
            aria-pressed={active}
            title={`${i + 1} ${candidate.word}`}
            onClick={() => view.switchTarget(i)}
            style={active
              ? {
                ...CHIP_STYLE,
                background: 'var(--color-brand-soft)',
                borderColor: 'var(--color-brand)',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
              }
              : CHIP_STYLE}
          >
            <span style={{ ...CHIP_NUMBER_STYLE, ...(active ? { color: 'var(--color-brand)' } : null) }}>{i + 1}</span>
            {candidate.word}
          </button>
        )
      })}
    </div>
  )
}

function AttachPicker({
  groups, attachKey, onChoose,
}: { groups: DefinitionGroup[]; attachKey: string | null; onChoose: (key: string) => void }) {
  if (groups.length === 0) return null
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={ATTACH_HEAD_STYLE}>整句归入哪个释义</div>
      <div role="radiogroup" aria-label="整句归入哪个释义">
        {groups.map((group, gi) => group.leaves.map((leaf, j) => {
          const active = leaf.key === attachKey
          return (
            <button
              key={leaf.key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${group.pos || '该词性'} ${leaf.label} ${leaf.value}`}
              onClick={() => onChoose(leaf.key)}
              style={{
                ...ATTACH_ROW_STYLE,
                ...(gi > 0 || j > 0 ? { borderTop: '1px solid var(--color-border)' } : null),
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{
                ...RADIO_STYLE,
                ...(active ? { borderColor: 'var(--color-brand)', background: 'var(--color-surface)' } : null),
              }}>
                {active && <span style={RADIO_DOT_STYLE} />}
              </span>
              <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{leaf.label}</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{leaf.value}</span>
            </button>
          )
        }))}
      </div>
    </div>
  )
}

const openDictFor = (word: string | null) => {
  if (!word) return
  void invoke('collector_open_dict', { word }).catch(e => console.error('[collector] 打开详情页失败', e))
}

/**
 * 键盘：Enter 收录、1–9 换目标词。只有文本输入类控件豁免（打字 / 输入法）；
 * 按钮 / 勾选框聚焦时仍响应——原生激活由 `preventDefault` 拦下，重复触发由 `busyRef` 兜住。
 */
function useSentenceKeys(view: SentenceView, onEnter: () => void) {
  // 两个入口每次渲染都会新建闭包 / 视图对象；用 ref 承接，监听只在候选表或目标词变化时重挂。
  const enterRef = useRef(onEnter)
  enterRef.current = onEnter
  const viewRef = useRef(view)
  viewRef.current = view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable
      if (e.key === 'Enter') {
        if (typing) return
        e.preventDefault()
        enterRef.current()
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (!/^[1-9]$/.test(e.key)) return
      const index = Number(e.key) - 1
      if (index >= (viewRef.current.candidates?.length ?? 0)) return
      e.preventDefault()
      viewRef.current.switchTarget(index)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

interface BodyProps {
  /** 句子卡、目标词行与状态块（两个入口各自组装，正文只负责树与底栏）。 */
  header: ReactNode
  view: SentenceView
  selection: DefinitionSelection
  outcome: GrabOutcome
}

/**
 * 新词正文：勾选释义 + 归属 + 「收录」（走 `collectorMergeInputs` → `collectNewWord`）。
 * 只在当前目标词**不在库**时渲染。
 */
export function NewSentenceBody({ header, view, selection, outcome }: BodyProps) {
  const [busy, setBusy] = useState(false)
  const [collectError, setCollectError] = useState<string | null>(null)

  const notFound = view.targetWord !== null && !view.loading && !view.lookupError && view.allKeys.length === 0
  const showTree = !view.loading && !view.lookupError && view.allKeys.length > 0
  const canCollect = showTree && selection.attachKey !== null && selection.selected.size > 0

  // 换目标词时清掉上一个词留下的红字（T13 评审 Minor）。
  useEffect(() => { setCollectError(null) }, [view.targetWord])

  const handleCollect = useCallback(async () => {
    if (view.busyRef.current || !view.target || !selection.attachKey || view.allKeys.length === 0) return
    const inputs = collectorMergeInputs(view.fields, selection.selected, {
      text: outcome.text, leafKey: selection.attachKey,
    })
    if (inputs.length === 0) return
    view.busyRef.current = true
    setBusy(true)
    setCollectError(null)
    try {
      const result = await collectNewWord({
        word: view.target.word,
        inputs,
        familiarity: 1, // 句子模式没有熟悉度控件，按搜索返回页的默认值写入。
        grabId: outcome.grabId,
      })
      if (result === 'failed') setCollectError('收录失败，请重试')
    } finally {
      view.busyRef.current = false
      setBusy(false)
    }
  }, [view, selection, outcome.text, outcome.grabId])

  useSentenceKeys(view, () => { void handleCollect() })

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px 14px' }}>
        {header}

        {view.candidates === null && <div style={LOADING_STYLE}>正在查询…</div>}

        {view.candidates !== null && view.targetWord === null && (
          <div style={LOADING_STYLE}>未找到可收录的目标词。</div>
        )}

        {view.loading && <div style={LOADING_STYLE}>正在查询…</div>}

        {view.lookupError && <div style={ERROR_STYLE}>词典查询失败，请重试。</div>}

        {notFound && (
          <>
            <div style={WORD_HEAD_STYLE}>{view.targetWord}</div>
            <div style={NOTE_STYLE}>词典未收录该词，无法收录。</div>
          </>
        )}

        {showTree && (
          <>
            <CollectorTree
              groups={view.groups}
              selected={selection.selected}
              onToggle={selection.toggle}
              forcedKey={selection.attachKey}
            />
            <AttachPicker groups={view.groups} attachKey={selection.attachKey} onChoose={selection.chooseAttach} />
          </>
        )}

        {collectError && <div style={ERROR_STYLE}>{collectError}</div>}
      </div>

      {notFound || view.lookupError || view.targetWord === null ? (
        <BottomBar>
          <Button variant="secondary" onClick={() => openDictFor(view.targetWord)} disabled={!view.targetWord}>打开详情页</Button>
        </BottomBar>
      ) : (
        <BottomBar hint={showTree ? 'Enter 收录　1–9 换目标词' : undefined}>
          <Button variant="secondary" onClick={() => openDictFor(view.targetWord)}>打开详情页</Button>
          <Button onClick={() => { void handleCollect() }} disabled={busy || !canCollect}>收录</Button>
        </BottomBar>
      )}
    </>
  )
}

/**
 * 已在库正文：同样的树与归属，但底栏是「收录例句」——只写例句，不写词性 / 释义。
 *
 * 走 `appendExampleUnderDefinition`（直接挂到既有释义行 id 下），**绝不**经过
 * `collectorMergeInputs`：把既有释义当 root 输入会插出重复释义（控制器裁定）。
 */
export function ExistingSentenceBody({ header, view, selection, outcome }: BodyProps) {
  const [busy, setBusy] = useState(false)
  const [collectError, setCollectError] = useState<string | null>(null)

  const showTree = !view.loading && !view.lookupError && view.allKeys.length > 0
  const attachLeaf = attachLeafOf(view.groups, selection.attachKey)
  const canCollect = showTree && attachLeaf !== null

  useEffect(() => { setCollectError(null) }, [view.targetWord])

  const handleCollect = useCallback(async () => {
    if (view.busyRef.current || !view.targetWord || !attachLeaf) return
    view.busyRef.current = true
    setBusy(true)
    setCollectError(null)
    try {
      const word = await ensureWord(view.targetWord)
      if (!word) throw new Error('ensureWord returned null')
      const ok = await appendExampleUnderDefinition(
        word.id,
        { key: attachLeaf.label === '中文释义' ? 'chinese_definition' : 'english_definition', value: attachLeaf.value },
        outcome.text,
      )
      if (!ok) throw new Error('appendExampleUnderDefinition failed')
      if (isGrabCurrent(outcome.grabId)) {
        await invoke('collector_hide').catch(e => console.error('[collector] 隐藏小窗失败', e))
      }
    } catch (e) {
      console.error('[collector] 收录例句失败', e)
      setCollectError('收录例句失败，请重试')
    } finally {
      view.busyRef.current = false
      setBusy(false)
    }
  }, [view, attachLeaf, outcome.text, outcome.grabId])

  useSentenceKeys(view, () => { void handleCollect() })

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px 14px' }}>
        {header}

        {/* 已在库目标不显示「正在查询…」：词典是否查到不影响已收录这个事实。 */}
        {view.lookupError && <div style={ERROR_STYLE}>词典查询失败，请重试。</div>}

        {showTree && (
          <>
            <CollectorTree
              groups={view.groups}
              selected={selection.selected}
              onToggle={selection.toggle}
              forcedKey={selection.attachKey}
            />
            <AttachPicker groups={view.groups} attachKey={selection.attachKey} onChoose={selection.chooseAttach} />
          </>
        )}

        {!view.loading && !view.lookupError && !showTree && (
          <div style={NOTE_STYLE}>词典中没有可归入的释义。</div>
        )}

        {collectError && <div style={ERROR_STYLE}>{collectError}</div>}
      </div>

      {canCollect ? (
        <BottomBar hint="Enter 收录例句　1–9 换目标词">
          <Button variant="secondary" onClick={() => openDictFor(view.targetWord)}>打开详情页</Button>
          <Button onClick={() => { void handleCollect() }} disabled={busy}>收录例句</Button>
        </BottomBar>
      ) : (
        <BottomBar>
          <Button variant="secondary" onClick={() => openDictFor(view.targetWord)}>打开详情页</Button>
        </BottomBar>
      )}
    </>
  )
}
