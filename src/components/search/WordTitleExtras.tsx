import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { MergeFieldInput } from '../../services/wordService'
import type { TitleMeta } from '../../providers/titleMeta'
import { buildTitleMetaInputs, type TitleStripSelection } from '../../lib/titleStrip'
import { ENTRY_BAND_FOOT_GAP, ENTRY_PHONETIC_GAP } from '../../lib/layout'
import { FIELD_LABEL_STYLE, BAND_LABEL_COLUMN, BAND_LABEL_GAP } from '../../lib/labelStyle'
import { useSettingsStore } from '../../stores/settingsStore'
import CheckBox from '../ui/CheckBox'

interface Props { meta: TitleMeta | null; onInputsChange: (inputs: MergeFieldInput[]) => void }

// 头带字段行的标签列（v0.7.2 建、v0.7.4 决定七 7.3 收）：字形取「中文释义(n)」那一套，
// 定宽列 44px。与 PhoneticArea 共用 labelStyle.ts 的 FIELD_LABEL_STYLE / BAND_LABEL_COLUMN，
// 两页才守得住「同一列」。
const LABEL_COL: CSSProperties = {
  ...FIELD_LABEL_STYLE, width: `${BAND_LABEL_COLUMN}px`, flex: 'none', paddingTop: '2px',
}

/**
 * 音标 / 词根两条可勾选字段行（v0.7.2 §8.3）。
 *
 * 不再是一条独立盒子——由 `DictDetailPanel` 交给 `EntryBand` 的 `rows`，与头带同幅。
 * 勾选框保留：它们是返回页唯一能**单独勾选合并**的两项（其余字段在正文流的行尾勾选），
 * 未勾选是中性描边。音标归本组件渲染——`EntryBand` 没有可勾选行的槽位（其 `phonetic` 槽已作废删除），
 * 音标要想带勾选框只能由这里出。
 */
export default function WordTitleExtras({ meta, onInputsChange }: Props) {
  const titleInfo = useSettingsStore(s => s.titleInfo)
  const [sel, setSel] = useState<TitleStripSelection>({ phonetic: true, wordRoot: true })

  useEffect(() => {
    setSel({ phonetic: true, wordRoot: true })
  }, [])

  // 单词不变（DictDetailPanel 换词卸载重建），重算并上报合并输入
  useEffect(() => {
    if (!meta) { onInputsChange([]); return }
    onInputsChange(buildTitleMetaInputs(meta, {
      phonetic: titleInfo.showPhonetic && sel.phonetic,
      wordRoot: titleInfo.showWordRoot && sel.wordRoot,
    }))
  }, [meta, sel, titleInfo.showPhonetic, titleInfo.showWordRoot, onInputsChange])

  if (!meta) return null
  const phonetic = titleInfo.showPhonetic && meta.phonetic !== null ? meta.phonetic : null
  const showWordRoot = titleInfo.showWordRoot && meta.wordRoots.length > 0
  if (phonetic === null && !showWordRoot) return null

  return (
    <>
      {phonetic !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: BAND_LABEL_GAP, marginTop: `${ENTRY_PHONETIC_GAP}px` }}>
          <span style={LABEL_COL}>音标</span>
          <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: '15px' }}>/{phonetic}/</span>
          <span style={{ display: 'inline-flex' }}>
            <CheckBox checked={sel.phonetic} onChange={v => setSel(s => ({ ...s, phonetic: v }))} label="音标" />
          </span>
        </div>
      )}

      {showWordRoot && (
        // 词根行的上间距取 ENTRY_BAND_FOOT_GAP（8）而不是 ENTRY_ROW_GAP（7）：v0.7.3 尾段起
        // 工作区的词根行挪进 EntryBand 的 footLeft、与末行右簇并成一行，那行的上间距由头带的
        // ENTRY_BAND_FOOT_GAP 给。本页不传 bottomRight，末行合并对它不可见，但两页的
        // 「音标 → 词根」距离必须一致，故这里取同一个值（差 9px 会看出两页不是同一套版式）。
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: BAND_LABEL_GAP, marginTop: `${ENTRY_BAND_FOOT_GAP}px` }}>
          <span style={LABEL_COL}>词根</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {meta.wordRoots.map((r, i) => (
              <span key={i} style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                {r.root}: {r.meaning}{r.origin ? `（${r.origin}）` : ''}
              </span>
            ))}
          </div>
          <span style={{ display: 'inline-flex', marginTop: 2 }}>
            <CheckBox checked={sel.wordRoot} onChange={v => setSel(s => ({ ...s, wordRoot: v }))} label="词根" />
          </span>
        </div>
      )}
    </>
  )
}
