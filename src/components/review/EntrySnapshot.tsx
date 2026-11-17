import { useEffect, useState, type CSSProperties } from 'react'
import { getValuesWithKeys } from '../../services/fieldService'
import { buildPosTree, type PosGroup } from '../../lib/review/entrySnapshot'
import { formatPhonetic } from '../../lib/phonetic'
import { jumpToWord } from '../../lib/review/jumpToWord'
import { FIELD_LABEL_STYLE } from '../../lib/labelStyle'

/** 义项行（中英共用）的骨架：11px 左衬 + 12px 间隙 + 18px 编号槽，正文悬挂缩进。
 *  `minWidth: 0` 与正文的 `flex: 1` 是一对：长释义在窄列里折行，而不是把本栏顶宽。 */
const SENSE_ROW_STYLE: CSSProperties = {
  display: 'flex', gap: '12px', padding: '3px 0 3px 11px', minWidth: 0,
}

/** 编号槽：18px 定宽、右对齐，与 `FlowRow` 的编号槽同值（15px 正文靠它悬挂）。
 *  行高取整 21px——12.5 × 1.7 = 21.25 的小数会让整行落在半像素上，横线被抗锯齿摊花。 */
const SENSE_NO_STYLE: CSSProperties = {
  width: 18, flex: 'none', textAlign: 'right', fontSize: '12.5px', lineHeight: '21px',
  color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', paddingTop: 2,
}

/** 义项正文：中英同色同级（v0.7.6 §3.1 墨阶规则），长词也必须在槽内断开。 */
const SENSE_TEXT_STYLE: CSSProperties = {
  flex: 1, minWidth: 0, fontSize: '15px', lineHeight: 1.6,
  color: 'var(--color-text-primary)', overflowWrap: 'anywhere',
}

/** 例句行：左缩进 41 = 11（行衬）+ 12（gap）+ 18（编号槽），与义项正文左缘对齐。
 *  例句挂在释义或词性下都用这一份，免得两处各写一份、日后走样。 */
const EXAMPLE_ROW_STYLE: CSSProperties = {
  padding: '1px 0 1px 41px', fontSize: '14px', lineHeight: 1.65,
  color: 'var(--color-text-secondary)', overflowWrap: 'anywhere',
}

/** 一条例句：三级墨的 `–` 前缀 + 二级墨正文。 */
function SnapshotExample({ text }: { text: string }) {
  return (
    <div style={EXAMPLE_ROW_STYLE}>
      <span style={{ color: 'var(--color-text-tertiary)', marginRight: 6 }}>–</span>
      {text}
    </div>
  )
}

/**
 * 「完整词条」快照（v0.6.2 条目 12；v0.7.6 §3.5 重设计）。
 *
 * 结构是「chrome 外框 + 白面内容区」：外框说明「这是一份附在答题页上的只读副本」，
 * 白面承载正文。正文改按**工作区的排版语言**平铺，不再是一只只白色词性子卡：
 * 词性 run-in 头（衬线斜体 + 计数 + 拉满的 1px 发丝线）、悬挂缩进的义项行
 * （18px 右对齐编号槽）、41px 缩进的 `–` 例句。层级由线与缩进表达，不靠嵌套圆角盒子。
 *
 * 头部：C1 标签「完整词条」、可点的词名（衬线）+ 音标，右端「跳转工作台 ↗」；
 * 词名与右上角链接都走 `jumpToWord`。标签落在白面上，故取 `FIELD_LABEL_STYLE`
 * （白面档的标签墨），不是主题面那档。
 *
 * 不复用 WordWorkbench：那是个 600+ 行的编辑器，与 wordStore / 提供器耦合，
 * 只为读一遍就把它整块拉进复习模块不划算。这里按同一套视觉语言另写一个只读版；
 * 数值与 `SenseFlow` / `FlowRow` 对齐（改那边时对一眼这里），但不 import 它们。
 *
 * 它从**页面顶端**就开始（v0.6.3 打磨）：完整词条与题面并排、占右半页，摆位由
 * ReviewArena 的两栏网格负责。两轨都是 `minmax(0, 1fr)`、手机是单列，故承载长文本的
 * 每一层都带 `minWidth: 0`（词名 / 音标 / 义项 / 例句）——它们只换行，不会把列顶宽。
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
    <div style={{
      minWidth: 0,
      background: 'var(--color-chrome)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 10,
    }}>
      <div style={{
        minWidth: 0,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
      }}>
        <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--color-border-strong)' }}>
          <div style={FIELD_LABEL_STYLE}>完整词条</div>
          {/* 词名 + 音标在左、跳转链接在右。左组 flex:1 + minWidth:0，长词名与长音标
              改在组内折行；右链接 flex:none + nowrap，永远留在右端不被挤走。 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 8px', flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => void jumpToWord(wordId)}
                  style={{
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                    fontSize: '22px', fontWeight: 600, color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-serif)', textAlign: 'left', lineHeight: 1.25,
                    whiteSpace: 'normal', overflowWrap: 'anywhere',
                  }}
                >
                  {lemma}
                </button>
              </h3>
              {phonetic && (
                <span style={{
                  minWidth: 0, fontFamily: 'var(--font-phonetic)', fontSize: 15,
                  color: 'var(--color-text-secondary)', overflowWrap: 'anywhere',
                }}>
                  {formatPhonetic(phonetic)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void jumpToWord(wordId)}
              style={{
                flex: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: '10.5px', color: 'var(--color-text-tertiary)',
                whiteSpace: 'nowrap',
              }}
            >
              跳转工作台 ↗
            </button>
          </div>
        </div>

        {tree === null && (
          <span style={{ display: 'block', paddingTop: 10, fontSize: '11px', color: 'var(--color-text-secondary)' }}>快照加载中…</span>
        )}
        {tree?.length === 0 && (
          <span style={{ display: 'block', paddingTop: 10, fontSize: '12px', color: 'var(--color-text-secondary)' }}>这个词条还没有内容</span>
        )}
        {/* 词性组按工作区 SenseFlow 的 pos 分支排版：run-in 头 + 发丝线，义项靠编号槽悬挂。
            首个头上间距 4（与工作区「页签条 → 首个词性头」的节奏一致），组间 16 表达义项之间的呼吸；
            左缘 11 与义项行的行衬同一条线。 */}
        {tree?.map((g, i) => (
          <div key={g.id} style={{ minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: '10px', paddingLeft: '11px',
              lineHeight: '27px', marginTop: i === 0 ? '4px' : '16px',
            }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '16px', fontWeight: 600 }}>{g.pos}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                中文 {g.definitions.zh.length} · 英文 {g.definitions.en.length}
              </span>
              {/* 横线随剩余宽度拉满；上移 3px 让发丝线落在 run-in 文字的中腰，而不是基线。 */}
              <span style={{ flex: 1, borderTop: '1px solid var(--color-border)', transform: 'translateY(-3px)' }} />
            </div>

            {g.definitions.zh.map((d, j) => (
              <div key={d.id}>
                <div style={SENSE_ROW_STYLE}>
                  <span style={SENSE_NO_STYLE}>{j + 1}</span>
                  <span style={SENSE_TEXT_STYLE}>{d.text}</span>
                </div>
                {d.examples.map((ex, k) => <SnapshotExample key={`${d.id}-ex${k}`} text={ex} />)}
              </div>
            ))}

            {g.definitions.en.map((d, j) => (
              <div key={d.id}>
                <div style={SENSE_ROW_STYLE}>
                  <span style={SENSE_NO_STYLE}>{j + 1}</span>
                  <span style={SENSE_TEXT_STYLE}>{d.text}</span>
                </div>
                {d.examples.map((ex, k) => <SnapshotExample key={`${d.id}-ex${k}`} text={ex} />)}
              </div>
            ))}

            {g.examples.map((ex, j) => <SnapshotExample key={`${g.id}-pos-ex${j}`} text={ex} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
