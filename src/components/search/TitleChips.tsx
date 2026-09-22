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

// 柯林斯星级（v0.5.3 §3.3 第 18 条）：去 pill、紧随单词渲染。
// 独立于 TitleChips 导出，因为它要贴单词左端，而 TitleChips 内的标签要贴右缘。
export function CollinsStars({ meta }: { meta: TitleMeta | null }) {
  const titleInfo = useSettingsStore(s => s.titleInfo)
  if (!meta || !titleInfo.showCollinsStars) return null
  const n = meta.badges?.collins ?? 0
  if (n <= 0) return null
  return (
    <span style={{
      fontSize: 13, color: 'var(--color-accent)', letterSpacing: '1px',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  )
}

// 标题右侧徽标/领域标签（v0.5.3 §3.3）：两行右对齐 —— 徽标行、领域行。
// 不勾选、不入库，独立于词典开关显示。
export default function TitleChips({ meta }: { meta: TitleMeta | null }) {
  const titleInfo = useSettingsStore(s => s.titleInfo)
  if (!meta) return null

  const badges: ReactNode[] = []
  const domains: ReactNode[] = []

  if (titleInfo.showBadges && meta.badges) {
    if (meta.badges.oxford > 0) badges.push(chip('牛津3000'))
    meta.badges.tag.split(' ').map(t => TAG_LABELS[t] ?? t).filter(Boolean).forEach(t => badges.push(chip(t)))
  }
  if (titleInfo.showDomainCategory) meta.domains.categories.forEach(d => domains.push(chip(d)))
  if (titleInfo.showDomainRegion) meta.domains.regions.forEach(d => domains.push(chip(d)))
  if (titleInfo.showDomainUsage) meta.domains.usages.forEach(d => domains.push(chip(d)))

  if (badges.length === 0 && domains.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, width: '100%' }}>
      {badges.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {badges}
        </div>
      )}
      {domains.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {domains}
        </div>
      )}
    </div>
  )
}