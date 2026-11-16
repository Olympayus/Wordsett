import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '../components/ui/Button'
import { lookupWord } from '../services/searchService'
import { getWordFreqs } from '../services/lemmaFreq'
import { setInitialFamiliarity } from '../services/wordService'
import { contentCandidates, pickDefaultTarget, tokenize, type TargetCandidate } from '../lib/collectorTarget'
import { collectorMergeInputs, definitionGroups, leafKeys, type DefinitionGroup } from '../lib/collectorTree'
import { toggleSubtreeSelection } from '../lib/dictPlan'
import { ensureWord } from '../lib/ensureWord'
import { libraryLocationIn } from '../lib/collected'
import { FIELD_LABEL_STYLE } from '../lib/labelStyle'
import { useWordStore } from '../stores/wordStore'
import type { DictionaryField } from '../types/dictionary'
import { CollectorTree } from './CollectorTree'
import { BottomBar, CollectorTitleBar, WORD_HEAD_STYLE } from './CollectorWord'
import type { GrabOutcome } from './types'

/**
 * 句子模式的快速收录卡（v0.7.9 spec §5.3 / §5.4）。
 *
 * 三段结构：标题条 → 句子卡 + 目标词行 + 定义树 +「整句归入哪个释义」→ 底栏。
 * 数据分两条线：候选（`getWordFreqs` → `contentCandidates`，一次算定）与目标词的释义
 * （`lookupWord`，每次换词各查一次）。
 *
 * **胶囊顺序与数字键映射在本次抓取内固定**：候选只在挂载后的 effect 里算一次，此后换词
 * 只改 `target`，从不重算 / 重排 `candidates`——`1–9` 因此永远指向同一枚胶囊。
 *
 * 「整句归入哪个释义」是例句的父级约束：所选叶子在树里强制勾选且不可取消，收录时
 * 随 `collectorMergeInputs` 的 `attach` 一并落到同一次 `mergeWordFields` 里。
 *
 * 本任务只做「新词」路径；目标词已在库时不写入（T14 的 `CollectorExisting` 接管例句
 * 追加）。底栏在那种情况下只留「打开详情页」。
 */

/** 目标词为空 / 未加载完时的稳定空数组：让 `fields` 的引用不随渲染变化。 */
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

export function CollectorSentence({ outcome }: { outcome: GrabOutcome }) {
  /** 本次抓取的候选表：加载完成后**只读**，换词不重排（数字键映射因此稳定）。 */
  const [candidates, setCandidates] = useState<TargetCandidate[] | null>(null)
  const [target, setTarget] = useState<TargetCandidate | null>(null)
  /** 上一次查询结果（带词面）：只有 `word === targetWord` 时才把它当本文的字段树。 */
  const [result, setResult] = useState<{ word: string; fields: DictionaryField[] } | null>(null)
  /** 查询失败的那个词面；与 `targetWord` 比较后才算当前目标的错误。 */
  const [failureWord, setFailureWord] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>())
  const [attachKey, setAttachKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [collectError, setCollectError] = useState<string | null>(null)
  // 同步闸门：Enter 与「收录」按钮可能在同一毫秒各触发一次（按钮聚焦时按 Enter，
  // 原生 click 与 window keydown 都会到达），ref 比 state 早一个渲染周期。
  const busyRef = useRef(false)
  // 卸载标志：Root 用 grabId 作 key，换一次抓取就卸载本实例。本实例的写链可能比新一代
  // 抓取的「读选区 → show」更慢，此时再调 `collector_hide` 会把**新窗口**藏掉。
  const mountedRef = useRef(true)
  useEffect(() => {
    // setup 必须重申 true：StrictMode 在 dev 下会 setup → cleanup → setup 跑一遍。
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 候选只在挂载时（或换了一次抓取）算一次：词频异步补齐后排序落定，此后换词只改 target。
  useEffect(() => {
    let cancelled = false
    setCandidates(null)
    setTarget(null)
    void getWordFreqs(tokenize(outcome.text)).then(freqs => {
      if (cancelled) return
      const list = contentCandidates(outcome.text, w => freqs.get(w.toLowerCase()))
      setCandidates(list)
      setTarget(pickDefaultTarget(list))
    })
    return () => { cancelled = true }
  }, [outcome.text])

  const targetWord = target?.word ?? null

  // 目标词的释义树：每换一个词查一次；失败记在该词面下，换词后自然失效。
  useEffect(() => {
    if (!targetWord) return
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
  }, [targetWord])

  // 结果只对产生它的词面有效：换词后的首次渲染立刻回到「查询中」，不会闪一帧旧树。
  const fields = result && result.word === targetWord ? result.fields : EMPTY_FIELDS
  const lookupError = targetWord !== null && failureWord === targetWord
  const loading = targetWord !== null && !lookupError && !(result && result.word === targetWord)

  const groups = useMemo(() => definitionGroups(fields).filter(g => g.leaves.length > 0), [fields])
  const allKeys = useMemo(() => leafKeys(groups), [groups])

  // 每个目标词都从「全选 + 默认归属」开始。用 layout effect：树第一次出现的同一帧就带上
  // 全选，不让用户看见「全空 → 全选」的跳变；旧词的勾选键也绝不带进新词。
  useLayoutEffect(() => {
    setSelected(new Set(allKeys))
    setAttachKey(defaultAttachKey(groups))
  }, [groups, allKeys])

  const location = useWordStore(s => libraryLocationIn(s.libraryIndex, targetWord ?? ''))
  const alreadyInLibrary = location !== null

  const handleToggle = useCallback((key: string) => {
    setSelected(prev => {
      const next = toggleSubtreeSelection(prev, allKeys, key)
      // 归属释义必须始终在选中集里：它是例句的父级，取消它会让例句悬空。
      if (attachKey && !next.has(attachKey)) next.add(attachKey)
      return next
    })
  }, [allKeys, attachKey])

  const chooseAttach = useCallback((key: string) => {
    setAttachKey(key)
    setSelected(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
  }, [])

  const switchTarget = useCallback((index: number) => {
    if (busyRef.current) return
    const next = candidates?.[index]
    if (next) setTarget(next)
  }, [candidates])

  const openDict = useCallback(() => {
    if (!targetWord) return
    void invoke('collector_open_dict', { word: targetWord }).catch(e => console.error('[collector] 打开详情页失败', e))
  }, [targetWord])

  const handleCollect = useCallback(async () => {
    if (busyRef.current || alreadyInLibrary || !target || !attachKey || allKeys.length === 0) return
    const inputs = collectorMergeInputs(fields, selected, { text: outcome.text, leafKey: attachKey })
    if (inputs.length === 0) return
    busyRef.current = true
    setBusy(true)
    setCollectError(null)
    try {
      // 落库前再确认一次「不在库」：Root 的索引刷新与本组件的挂载是并行的。这句与
      // CollectorWord 同源——既有的句子流程（只追加例句）是 T14 的事，本任务不能把
      // 既有词当新词再合并一遍释义。
      await useWordStore.getState().reloadLibraryIndex()
      if (libraryLocationIn(useWordStore.getState().libraryIndex, target.word) !== null) return
      const word = await ensureWord(target.word)
      if (!word) throw new Error('ensureWord returned null')
      const merged = await useWordStore.getState().mergeWordFields(word.id, inputs)
      if (!merged) throw new Error('mergeWordFields failed')
      // 句子模式没有熟悉度控件，新词按搜索返回页的默认值写入。
      // 写入失败不阻断收录（字段已落库，缺失只让该词回落 1）。
      const wrote = await setInitialFamiliarity(word.id, 1)
      if (!wrote) console.error('[collector] 初始熟悉度写入失败')
      if (mountedRef.current) {
        await invoke('collector_hide').catch(e => console.error('[collector] 隐藏小窗失败', e))
      }
    } catch (e) {
      console.error('[collector] 收录失败', e)
      setCollectError('收录失败，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [alreadyInLibrary, target, attachKey, allKeys, fields, selected, outcome.text])

  // 键位：Enter 收录、1–9 换目标词。只有文本输入类控件豁免（与本窗单词模式同一判据）；
  // 按钮 / 勾选框聚焦时仍响应——原生激活由 `preventDefault` 拦下，重复触发由 busyRef 兜住。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable
      if (e.key === 'Enter') {
        if (typing) return
        e.preventDefault()
        void handleCollect()
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (!/^[1-9]$/.test(e.key)) return
      const index = Number(e.key) - 1
      if (index >= (candidates?.length ?? 0)) return
      e.preventDefault()
      switchTarget(index)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleCollect, candidates, switchTarget])

  const showTree = !loading && !lookupError && !alreadyInLibrary && allKeys.length > 0
  const notFound = targetWord !== null && !loading && !lookupError && allKeys.length === 0
  const canCollect = showTree && attachKey !== null && selected.size > 0
  const onlyOpenDict = alreadyInLibrary || notFound || lookupError

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <CollectorTitleBar />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px 14px' }}>
        {/* 句子卡：整句 + 目标词高亮，不渲染任何说明文字。 */}
        <div style={SENTENCE_CARD_STYLE}>{highlightSentence(outcome.text, targetWord)}</div>

        {/* 目标词行：C1 标签 + 数字键胶囊（词频升序、本次抓取内固定）。 */}
        <div style={TARGETS_STYLE}>
          <span style={{ ...FIELD_LABEL_STYLE, marginRight: '2px' }}>目标词</span>
          {(candidates ?? []).map((candidate, i) => {
            const active = candidate.word === targetWord
            return (
              <button
                key={candidate.word}
                type="button"
                aria-pressed={active}
                title={`${i + 1} ${candidate.word}`}
                onClick={() => switchTarget(i)}
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

        {candidates === null && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-text-tertiary)' }}>正在查询…</div>
        )}

        {candidates !== null && targetWord === null && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-text-tertiary)' }}>未找到可收录的目标词。</div>
        )}

        {!loading && !lookupError && alreadyInLibrary && (
          <div style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            这个词已在词库中，本次不重复收录。
          </div>
        )}

        {loading && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-text-tertiary)' }}>正在查询…</div>
        )}

        {lookupError && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-danger)' }}>词典查询失败，请重试。</div>
        )}

        {notFound && (
          <>
            <div style={WORD_HEAD_STYLE}>{targetWord}</div>
            <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
              词典未收录该词，无法收录。
            </div>
          </>
        )}

        {showTree && (
          <>
            <CollectorTree groups={groups} selected={selected} onToggle={handleToggle} forcedKey={attachKey} />

            {allKeys.length > 0 && (
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}>
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
                        onClick={() => chooseAttach(leaf.key)}
                        style={{
                          ...ATTACH_ROW_STYLE,
                          ...(gi > 0 || j > 0 ? { borderTop: '1px solid var(--color-border)' } : null),
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{
                          ...RADIO_STYLE,
                          ...(active
                            ? { borderColor: 'var(--color-brand)', background: 'var(--color-surface)' }
                            : null),
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
            )}
          </>
        )}

        {collectError && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-danger)' }}>{collectError}</div>
        )}
      </div>

      {onlyOpenDict || targetWord === null ? (
        <BottomBar>
          <Button variant="secondary" onClick={openDict} disabled={!targetWord}>打开详情页</Button>
        </BottomBar>
      ) : (
        <BottomBar hint="Enter 收录　1–9 换目标词">
          <Button variant="secondary" onClick={openDict}>打开详情页</Button>
          <Button onClick={() => { void handleCollect() }} disabled={busy || !canCollect}>
            收录
          </Button>
        </BottomBar>
      )}
    </div>
  )
}
