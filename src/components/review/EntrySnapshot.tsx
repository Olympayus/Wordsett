import { useEffect, useState } from 'react'
import { getValuesWithKeys } from '../../services/fieldService'
import { buildPosTree, type PosGroup } from '../../lib/review/entrySnapshot'
import { formatPhonetic } from '../../lib/phonetic'
import { jumpToWord } from '../../lib/review/jumpToWord'

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
 * 它现在从**页面顶端**就开始（v0.6.3 打磨）：完整词条与题面并排、占右半页，摆位由
 * ReviewArena 的两栏网格负责。词条的文字照旧会换行（长义项该换就换），是布局的
 * 单侧上限（resultLayout.RESULT_HALF_WIDTH）约束「这一栏有多宽」，不是按内容伸缩。
 */
export default function EntrySnapshot({ wordId, lemma, phonetic }: {
  wordId: string
  lemma: string
  phonetic: string
}) {
  const [tree, setTree] = useState<PosGroup[] | null>(null)

  useEffect(() => {
    let alive = true
    getValuesWithKeys(wordId)
      .then(rows => { if (alive) setTree(buildPosTree(rows)) })
      .catch(() => { if (alive) setTree([]) })
    return () => { alive = false }
  }, [wordId])

  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>完整词条</span>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 style={{ margin: 0 }}>
          <button
            type="button"
            onClick={() => void jumpToWord(wordId)}
            title="跳转到工作台"
            style={{
              border: 'none', background: 'none', padding: 0, cursor: 'pointer',
              fontSize: '22px', fontWeight: 600, color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-serif)', textAlign: 'left',
            }}
          >
            {lemma}
          </button>
        </h3>
        {phonetic && (
          <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: 15, color: 'var(--color-text-secondary)' }}>
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
            <span style={{
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
