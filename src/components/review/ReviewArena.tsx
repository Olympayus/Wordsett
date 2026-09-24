import { useEffect, useRef, useState } from 'react'
import PromptCard, { inputKindFor, typedTarget } from './PromptCard'
import RatingBar from './RatingBar'
import ResultBlock from './ResultBlock'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { rateCard, type CardContent } from '../../services/reviewService'
import { compareTyped } from '../../lib/review/typed'
import { getWordContent } from '../../db/review'

/**
 * 答题态。两段式：作答（红绿提示）→ 三键评分。
 * 用局部 revealed 驱动「作答前 / 作答后」两态；store 的 phase 只记录会话级状态。
 */
export default function ReviewArena() {
  const { queue, index, answerCurrent, advance } = useReviewSessionStore()
  const letterHighlight = useSettingsStore(s => s.review.letterHighlight)
  const retention = useSettingsStore(s => s.review.retention)

  const [revealed, setRevealed] = useState(false)
  const [lastInput, setLastInput] = useState('')
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [snapshot, setSnapshot] = useState<CardContent | null>(null)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [rating, setRating] = useState(false)
  // 同步置位的重入闸：键盘监听闭包里的 rating state 有滞后，连按两下会重复提交评分
  const ratingRef = useRef(false)

  const dto = queue[index]

  useEffect(() => {
    setRevealed(false); setLastInput(''); setCorrect(null); setSnapshot(null)
    setStartedAt(Date.now()); setRating(false); ratingRef.current = false
    if (!dto) return
    let alive = true
    // getWordContent 本身不吞异常（可能 reject），快照失败按「暂无快照」降级
    getWordContent(dto.wordId).then(c => { if (alive) setSnapshot(c) }).catch(() => { if (alive) setSnapshot(null) })
    return () => { alive = false }
  }, [dto?.cardId])

  if (!dto) return null

  const handleSubmit = (input: string) => {
    setLastInput(input)
    const kind = inputKindFor(dto.template)
    if (kind === 'choice') {
      setCorrect(input === String((dto.answer as any).translation ?? ''))
    } else if (kind === 'typed') {
      const target = typedTarget(dto)
      setCorrect(target ? compareTyped(input, target) : null)
    } else {
      setCorrect(null)   // 中译英 / 英文释义题：键入仅为拼写辅助，不自动判分
    }
    setRevealed(true)
  }

  const handleRate = async (r: number) => {
    // 同步置位、且成功 advance 前不解锁：键盘监听闭包里的 rating state 有滞后，连按两下
    // 会重复提交；「advance 之后、换卡 effect 之前」落下的按键会用旧卡 dto 重复评分。
    if (ratingRef.current) return
    ratingRef.current = true
    setRating(true)
    // 会话所属策略决定计分与否：被切到别的策略下查看的会话仍按自己的模式评分
    const mode = useReviewSessionStore.getState().sessionStrategy === 'today' ? 'review' : 'practice'
    try {
      await rateCard({ cardId: dto.cardId, rating: r, template: dto.template, mode, durationMs: Date.now() - startedAt, retention })
    } catch {
      // 落库失败：不记账、不前进，松开闸门让用户重试（未 advance，仍是当前卡）
      ratingRef.current = false
      setRating(false)
      return
    }
    // 落库成功后再记账，保证 answered 里不出现没写进库的评分
    answerCurrent(r)
    advance()
  }

  // 揭示后可用 1 / 2 / 3 键评分
  useEffect(() => {
    if (!revealed) return
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i >= 0) { e.preventDefault(); handleRate(i + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, dto.cardId])

  return (
    <div className="flex flex-col gap-6 p-8" style={{ maxWidth: '960px' }}>
      <div className="flex items-center gap-3">
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          {index + 1} / {queue.length}
        </span>
        <div style={{ flex: 1, height: '3px', background: 'var(--color-border)', borderRadius: '2px' }}>
          <div style={{ width: `${((index + 1) / queue.length) * 100}%`, height: '100%', background: 'var(--color-brand)', borderRadius: '2px' }} />
        </div>
      </div>

      <PromptCard dto={dto} letterHighlight={letterHighlight} disabled={revealed} onSubmit={handleSubmit} />

      {revealed && (
        <>
          <ResultBlock dto={dto} snapshot={snapshot} lastInput={lastInput} correct={correct} />
          <RatingBar onRate={handleRate} disabled={rating} />
          <button
            type="button"
            onClick={() => handleRate(1)}
            style={{ alignSelf: 'flex-start', fontSize: '12px', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
          >
            直接跳过（记为忘了）
          </button>
        </>
      )}
    </div>
  )
}
