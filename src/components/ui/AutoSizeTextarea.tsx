import { useEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

// 自适应编辑框：宽/高随内容伸缩。短或空词条 → 单行宽度；长内容 → 撑到容器宽度后换行。
export default function AutoSizeTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 测量内容自然宽度（临时 nowrap），再回落到 wrap
    const prev = el.style.whiteSpace
    el.style.whiteSpace = 'nowrap'
    const natural = el.scrollWidth + 2
    el.style.whiteSpace = prev
    const maxW = el.parentElement ? el.parentElement.clientWidth : 480
    el.style.width = `${Math.min(Math.max(natural, 120), maxW)}px`
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea {...props} ref={ref} rows={1} />
}