import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { MergeFieldInput } from '../../services/wordService'
import type { TitleMeta } from '../../providers/titleMeta'
import { buildTitleMetaInputs, type TitleStripSelection } from '../../lib/titleStrip'
import { useSettingsStore } from '../../stores/settingsStore'

const TAG_LABELS: Record<string, string> = {
  zk: '中考', gk: '高考', cet4: '四级', cet6: '六级', ky: '考研',
  toefl: '托福', ielts: '雅思', gre: 'GRE',
}

function chip(text: string): ReactNode {
  return (
    <span key={text} style={{
      fontSize: 11, padding: '1px 8px', borderRadius: 'var(--radius-full)',
      border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)',
      color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

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

  const hasAny = titleInfo.showBadges || titleInfo.showPhonetic ||
    titleInfo.showWordRoot || titleInfo.showDomainCategory ||
    titleInfo.showDomainRegion || titleInfo.showDomainUsage
  if (!hasAny) return null

  const checkable = (label: string, checked: boolean, onToggle: (v: boolean) => void) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
      <input type="checkbox" checked={checked} onChange={e => onToggle(e.target.checked)} aria-label={label} />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>{label}</span>
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {titleInfo.showBadges && meta.badges && (
          <>
            {meta.badges.collins > 0 && chip('★'.repeat(meta.badges.collins) + '☆'.repeat(5 - meta.badges.collins))}
            {meta.badges.oxford > 0 && chip('牛津3000')}
            {meta.badges.tag.split(' ').map(t => TAG_LABELS[t] ?? t).filter(Boolean).map(chip)}
          </>
        )}
        {titleInfo.showDomainCategory && meta.domains.categories.length > 0 &&
          <>{meta.domains.categories.map(chip)}</>}
        {titleInfo.showDomainRegion && meta.domains.regions.length > 0 &&
          <>{meta.domains.regions.map(chip)}</>}
        {titleInfo.showDomainUsage && meta.domains.usages.length > 0 &&
          <>{meta.domains.usages.map(chip)}</>}
      </div>

      {titleInfo.showPhonetic && meta.phonetic && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {checkable('勾选音标', sel.phonetic, v => setSel(s => ({ ...s, phonetic: v })))}
          <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: 15 }}>{meta.phonetic}</span>
        </div>
      )}

      {titleInfo.showWordRoot && meta.wordRoots.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {checkable('勾选词根', sel.wordRoot, v => setSel(s => ({ ...s, wordRoot: v })))}
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