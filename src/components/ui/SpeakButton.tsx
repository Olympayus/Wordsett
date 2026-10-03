import { useState } from 'react'
import { speakWord } from '../../lib/review/speak'

/**
 * 喇叭按钮（v0.6.3 条目 12）：工作台词条标题、复习认读题面、词典详情页标题三处共用。
 *
 * 只听 `recognize` 一种题型——其余四类都不可挂：cloze / recall / english_def 的答案就是这个词，
 * 挂上去等于报答案；listen 本来就在播。这条约束由调用点负责，本组件不做判断。
 *
 * 降级行为见 lib/review/speak.ts。**`onPlay` 是这条降级的出口**：默认路径（`speakWord`）
 * 一律静默吞错，因为「点了没声」是稳定的环境事实、不是故障；设置页的试听不一样——
 * 那里的失败（音色被卸载）正是用户需要知道的事，故由调用方接管并自行报错。
 */
export default function SpeakButton({ text, size = 17, label = '播放发音', tone = 'tertiary', onPlay }: {
  text: string; size?: number; label?: string
  /** 静止态的颜色。默认 `tertiary`（词条卡/题面那三处的现状）；设置页的小标题旁是近黑
   *  加粗字，`tertiary` 压在旁边太淡，故那里传 `secondary`。hover 一律转品牌色，不随此变。 */
  tone?: 'tertiary' | 'secondary'
  /** 接管默认的 `speakWord`。调用方自己负责错误——见上方注释。 */
  onPlay?: () => void
}) {
  const [hover, setHover] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { if (onPlay) onPlay(); else void speakWord(text) }}
      style={{
        border: 'none', background: hover ? 'var(--color-brand-softer)' : 'transparent',
        color: hover ? 'var(--color-brand)' : `var(--color-text-${tone})`,
        padding: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
        borderRadius: 'var(--radius-sm)', flexShrink: 0,
        transition: 'color var(--duration-fast) var(--ease-smooth), background-color var(--duration-fast) var(--ease-smooth)',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  )
}
