import type { ReactNode } from 'react'
import type { TitleMeta } from '../../providers/titleMeta'
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

// 标题右侧展示型徽标/领域标签（v0.5）：不勾选、不入库，独立于词典开关显示
export default function TitleChips({ meta }: { meta: TitleMeta | null }) {
  const titleInfo = useSettingsStore(s => s.titleInfo)
  if (!meta) return null

  const items: ReactNode[] = []
  if (titleInfo.showBadges && meta.badges) {
    if (meta.badges.collins > 0) items.push(chip('★'.repeat(meta.badges.collins) + '☆'.repeat(5 - meta.badges.collins)))
    if (meta.badges.oxford > 0) items.push(chip('牛津3000'))
    meta.badges.tag.split(' ').map(t => TAG_LABELS[t] ?? t).filter(Boolean).forEach(t => items.push(chip(t)))
  }
  if (titleInfo.showDomainCategory) meta.domains.categories.forEach(d => items.push(chip(d)))
  if (titleInfo.showDomainRegion) meta.domains.regions.forEach(d => items.push(chip(d)))
  if (titleInfo.showDomainUsage) meta.domains.usages.forEach(d => items.push(chip(d)))

  if (items.length === 0) return null

  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{items}</div>
}