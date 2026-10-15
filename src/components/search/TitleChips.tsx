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

// 标题右侧徽标/领域标签（v0.5.3 §3.3；v0.7.2 二轮改**单行**）。
// 不勾选、不入库，独立于词典开关显示。
//
// 先前是 `flexDirection:'column'` 两行上下叠，每行各自右对齐——用户看到的是一个两行的
// 块，而设计稿 `.hw-right` 是 `display:flex; align-items:center` 的**单行**
// （showcase-v2:157），`.examtags` 也是 `display:inline-flex`（:167）。故改成单行。
// 两类标签的区分不再靠换行，改靠**间距分档**：组内 4px、组间 10px——同一行里仍能读出
// 「这两枚是一类、那两枚是另一类」，且任何一类的存在与否都不影响另一类的落点
// （有空组就不渲染那个 span，flex 的 gap 只在实有子项之间生效）。
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
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
                  justifyContent: 'flex-end', gap: '10px' }}>
      {badges.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px' }}>
          {badges}
        </span>
      )}
      {domains.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px' }}>
          {domains}
        </span>
      )}
    </div>
  )
}