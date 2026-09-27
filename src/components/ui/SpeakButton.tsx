import { useState } from 'react'
import { speakWord } from '../../lib/review/speak'

/**
 * 喇叭按钮（v0.6.3 条目 12）：工作台词条标题、复习认读题面、词典详情页标题三处共用。
 *
 * 只听 `recognize` 一种题型——其余四类都不可挂：cloze / recall / english_def 的答案就是这个词，
 * 挂上去等于报答案；listen 本来就在播。这条约束由调用点负责，本组件不做判断。
 *
 * 降级行为见 lib/review/speak.ts。
 */
export default function SpeakButton({ text, size = 17 }: { text: string; size?: number }) {
  const [hover, setHover] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      title="播放发音"
      aria-label="播放发音"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { void speakWord(text) }}
      style={{
        border: 'none', background: hover ? 'var(--color-brand-softer)' : 'transparent',
        color: hover ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
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
