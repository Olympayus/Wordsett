import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getValuesWithKeys } from '../../services/fieldService'
import { buildPosTree, type PosGroup } from '../../lib/review/entrySnapshot'
import { formatPhonetic } from '../../lib/phonetic'
import { jumpToWord } from '../../lib/review/jumpToWord'

/** 供 layout effect 量的标记：这类元素是**不可断行**的（换行或溢出即算「放不下」）。
 *  带 `-row` 后缀的那个元素是**容器**（单词 + 音标同行），它自身是 flex-wrap 的，
 *  单靠 data-measure 的摊开样式还会让内容换行；量之前要把它的 flex-wrap 关掉（见下面的量法）。 */
const NOWRAP_ITEM = 'data-nowrap'
const NOWRAP_ROW = 'data-nowrap-row'

/** 词性窗格的盒模型。取值理由见它上面的注释（与 WordWorkbench 的 paneStyle 同源，刻意不同处已点明）。 */
const PANE_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  borderLeft: '3px solid var(--color-border-strong)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px', marginTop: 4,
}

/**
 * 「完整词条」快照（v0.6.2 条目 12）。
 *
 * 只读复刻工作台「词性」标签页的树：按词性父分窗格，每个词性下列中 / 英释义编号项，
 * 英释义下再挂该条释义自己的例句。去掉所有编辑控件与折叠展开，全部平铺。标题可点跳工作台。
 *
 * 不复用 WordWorkbench：那是个 600+ 行的编辑器，与 wordStore / 提供器耦合，
 * 只为读一遍就把它整块拉进复习模块不划算。这里按同一套视觉语言另写一个只读版。
 *
 * **量自己的最宽不可断行**（v0.6.3 打磨）：结果区是「两栏并排」还是「快照置底」，
 * 由这个词条自己的内容决定——长单词、长音标、宽词性窗格在半栏里必然换行或溢出。
 * 量法见下面的 useLayoutEffect：把不可断元素临时摊成自然宽，量完再放回去。
 * `onIntrinsicWidth` 传 undefined 时不量（无消费者）。
 */
export default function EntrySnapshot({ wordId, lemma, phonetic, onIntrinsicWidth }: {
  wordId: string
  lemma: string
  phonetic: string
  /** 报告本快照最宽不可断行的自然宽度（px）；并排 / 置底的判据由调用方拿它去比 */
  onIntrinsicWidth?: (px: number) => void
}) {
  const [tree, setTree] = useState<PosGroup[] | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // 已报告的宽度：内容没变就不重复上报，避免调用方被同一帧的无谓通知带着重渲染。
  const reportedRef = useRef(-1)

  useEffect(() => {
    let alive = true
    getValuesWithKeys(wordId)
      .then(rows => { if (alive) setTree(buildPosTree(rows)) })
      .catch(() => { if (alive) setTree([]) })
    return () => { alive = false }
  }, [wordId])

  // 量最宽不可断行：在 layout effect 里量（绘制前落地，用户看不到中间态），
  // 且依赖 tree / lemma / phonetic —— 内容量一变就重量一次，词条换掉自然跟着换。
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !onIntrinsicWidth) return
    // 数据还没回来时元素还没建出来，不量；首帧自然宽按 0 报（调用方按「放得下」处理，
    // 那一帧本来也没有内容可错位）。
    const items = root.querySelectorAll<HTMLElement>(`[${NOWRAP_ITEM}], [${NOWRAP_ROW}]`)
    let widest = 0
    for (const el of Array.from(items)) {
      const isRow = el.hasAttribute(NOWRAP_ROW)
      el.dataset.measure = isRow ? '' : '1'
      // 整行元素额外关掉 flex-wrap：它平时是 flex-wrap 的（窄栏时单词与音标会自动分两行），
      // 不关掉的话量到的是「被轨道压过、能塞进几行」的宽度，测不出「本来要多少」。
      const wrap = isRow ? el.style.flexWrap : null
      if (isRow) el.style.flexWrap = 'nowrap'
      // 逐个量、量一个撤一个：多个元素同时摊开时相互影响，一次只留一个处于测量态，
      // 读到的就是这个元素自己的自然宽。
      widest = Math.max(widest, el.scrollWidth)
      if (isRow) el.style.flexWrap = wrap ?? ''
      delete el.dataset.measure
    }
    if (widest === reportedRef.current) return
    reportedRef.current = widest
    onIntrinsicWidth(widest)
  }, [tree, lemma, phonetic, onIntrinsicWidth])

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>完整词条</span>
      {/* 单词 + 音标是同一个不可断行（data-nowrap-row 的元素摊成自然宽测量）——
          「epistemological /ˌepɪstɪməˈlɒdʒɪkəl/」这种组合在半栏里必然断行。 */}
      <div {...{ [NOWRAP_ROW]: '' }} className="flex flex-wrap items-baseline gap-2">
        <h3 style={{ margin: 0 }}>
          <button
            type="button"
            onClick={() => void jumpToWord(wordId)}
            title="跳转到工作台"
            style={{
              border: 'none', background: 'none', padding: 0, cursor: 'pointer',
              fontSize: '22px', fontWeight: 600, color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-serif)', textAlign: 'left', whiteSpace: 'nowrap',
            }}
          >
            {lemma}
          </button>
        </h3>
        {phonetic && (
          <span {...{ [NOWRAP_ITEM]: '' }} style={{ fontFamily: 'var(--font-phonetic)', fontSize: 15, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
            {formatPhonetic(phonetic)}
          </span>
        )}
      </div>

      {tree === null && (
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>快照加载中…</span>
      )}
      {tree?.length === 0 && (
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>这个词条还没有内容</span>
      )}
      {/* 词性窗格沿用工作台 paneStyle 的视觉语言（WordWorkbench.tsx:152-165）：中性底 + 边框
          + 3px 左竖条，不带字段状态色——快照是只读的，没有「已编辑」语义。
          刻意与工作台不同的一处：左右内边距 10px（那边是 4px）。工作台的 4px 是为
          多层嵌套的正文起点省位；快照只有一层，10px 才让词性标签与释义不贴框。
          PANE_STYLE 的其余值逐字照抄——改这里前先对一眼那边，两处本就该同源。 */}
      {tree?.map(g => (
        <div key={g.id} style={PANE_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: 4 }}>
            <span {...{ [NOWRAP_ITEM]: '' }} style={{
              display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 9px',
              borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--color-pos)',
              color: 'var(--color-pos)', background: 'transparent',
              fontSize: 12, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap',
            }}>
              {g.pos}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
              中文: {g.definitions.zh.length} · 英文: {g.definitions.en.length}
            </span>
          </div>
          {g.definitions.zh.map((d, i) => (
            <div key={d.id} style={{ fontSize: '13.5px', lineHeight: 1.7 }}>
              <span style={{ color: 'var(--color-text-tertiary)', marginRight: 6 }}>{i + 1}</span>{d.text}
            </div>
          ))}
          {g.definitions.en.map((d, i) => (
            <div key={d.id} style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-tertiary)', marginRight: 6 }}>{i + 1}</span>{d.text}
              {d.examples.map((ex, j) => (
                <div key={`${d.id}-ex${j}`} style={{
                  fontStyle: 'italic', color: 'var(--color-text-tertiary)',
                  paddingLeft: 14, marginTop: 2,
                }}>
                  {ex}
                </div>
              ))}
            </div>
          ))}
          {g.examples.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>例句</div>
              {g.examples.map((ex, i) => (
                <div key={`${g.id}-pos-ex${i}`} style={{
                  fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-tertiary)',
                  lineHeight: 1.7, paddingLeft: 14,
                }}>
                  {ex}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
