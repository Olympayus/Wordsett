import { useEffect, useState } from 'react'
import { getBacklinks } from '../../services/linkService'
import { useLinkJump } from '../../lib/linkJump'
import { ENTRY_BAND_WIDTH } from '../../lib/layout'
import type { Backlink } from '../../lib/links'

/**
 * 词条页底部的反链脚注（v0.7.5 任务 6）。
 *
 * 数据源是 `linkService.getBacklinks`，每次当前词的 lemma 变化时重扫一遍；空结果
 * **整块返回 null**（连标题一起不显示）——没有来源不是一种空状态，它只是这一节不存在。
 *
 * 点击来源词走 `useLinkJump`（与正文里的链接同一个去向判定），token 固定
 * `{ kind: 'library' }`：反链的来源必然是库内词条（`getBacklinks` 的 SQL 只连了 `words`）。
 *
 * 结果带着「是哪个 lemma 的」一起存：切换单词后、新请求落地前，不会把上一个词的
 * 反链画到当前词下面（否则会闪一帧别人的来源）。
 */
export default function BacklinksFootnote({ lemma }: { lemma: string }) {
  const jump = useLinkJump()
  const [result, setResult] = useState<{ lemma: string; items: Backlink[] }>({ lemma: '', items: [] })

  useEffect(() => {
    let cancelled = false
    getBacklinks(lemma)
      .then(items => { if (!cancelled) setResult({ lemma, items }) })
      .catch(() => { if (!cancelled) setResult({ lemma, items: [] }) })
    return () => { cancelled = true }
  }, [lemma])

  const items = result.lemma === lemma ? result.items : []
  if (items.length === 0) return null

  return (
    // 自身持与页级「＋ 添加」相同的度量（ENTRY_BAND_WIDTH）：组件因此不依赖调用方是否
    // 已经在 900 内容列里（当前是，见 WordWorkbench 的内容列），换到别处也不会横向溢出。
    // 块级 auto 宽度本来就不会超出父列，故这里不改变现有对齐；也不新增 wrapper 或竖向间距。
    <section aria-label="反链" style={{ marginTop: '20px', maxWidth: `${ENTRY_BAND_WIDTH}px` }}>
      {/* 小节标题沿用页面既有节奏：小号粗体三级墨 + 一条拉到右缘的细横线（与组头同形态）。 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.5px',
          color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap',
        }}>
          反链
        </span>
        <span style={{ flex: 1, borderTop: '1px solid var(--color-border)', transform: 'translateY(-3px)' }} />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {items.map(item => (
          <li
            key={`${item.sourceWordId}\u0000${item.fieldName}`}
            style={{ fontSize: 'var(--text-sm)', lineHeight: '21px', color: 'var(--color-text-secondary)' }}
          >
            <button
              type="button"
              title={`打开「${item.sourceLemma}」`}
              onClick={() => jump({ target: item.sourceLemma, kind: 'library' })}
              style={{
                border: 'none', background: 'transparent', padding: 0,
                font: 'inherit', color: 'var(--color-brand)', cursor: 'pointer',
                textDecoration: 'underline', borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-soft)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {item.sourceLemma}
            </button>
            {` - ${item.fieldName}`}
            {item.count > 1 && (
              <span className="stat-num" style={{ marginLeft: '6px', color: 'var(--color-text-tertiary)' }}>
                ×{item.count}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
