import { useEffect, useState } from 'react'
import type { MergeFieldInput } from '../../services/wordService'
import type { TitleMeta } from '../../providers/titleMeta'
import { buildTitleMetaInputs, type TitleStripSelection } from '../../lib/titleStrip'
import { useSettingsStore } from '../../stores/settingsStore'

interface Props { meta: TitleMeta | null; onInputsChange: (inputs: MergeFieldInput[]) => void }

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

  const checkable = (label: string, checked: boolean, onToggle: (v: boolean) => void) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
      <input type="checkbox" checked={checked} onChange={e => onToggle(e.target.checked)} aria-label={label} />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>{label}</span>
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '4px 0 14px' }}>
      {phonetic !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {checkable('音标', sel.phonetic, v => setSel(s => ({ ...s, phonetic: v })))}
          <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: 15 }}>/{phonetic}/</span>
        </div>
      )}

      {showWordRoot && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {checkable('词根', sel.wordRoot, v => setSel(s => ({ ...s, wordRoot: v })))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {meta.wordRoots.map((r, i) => (
              <span key={i} style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                {r.root}: {r.meaning}{r.origin ? `（${r.origin}）` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}