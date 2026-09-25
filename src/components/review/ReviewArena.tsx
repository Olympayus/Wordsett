import { useEffect, useRef, useState } from 'react'
import PromptCard, { inputKindFor, typedTarget } from './PromptCard'
import RatingBar from './RatingBar'
import ResultBlock from './ResultBlock'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { rateCard, type CardContent, type RateCardResult } from '../../services/reviewService'
import { compareTyped } from '../../lib/review/typed'
import { getWordContent } from '../../db/review'

/**
 * 答题态。三段：作答（红绿提示）→ 三键评分 → 结果区块停在屏上等「下一题」推进。
 * 局部 revealed 驱动「作答前 / 作答后」；store 的 phase 的 'rated' 驱动「已评分 / 待推进」。
 */
export default function ReviewArena() {
  const { queue, index, phase, answerCurrent, advance } = useReviewSessionStore()
  const letterHighlight = useSettingsStore(s => s.review.letterHighlight)
  const retention = useSettingsStore(s => s.review.retention)

  // 初值随 store：模块切走再切回时本组件会重挂，若这张卡已评分就直接停在结果态，不让它被再评一次
  const [revealed, setRevealed] = useState(() => useReviewSessionStore.getState().phase === 'rated')
  const [lastInput, setLastInput] = useState('')
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [snapshot, setSnapshot] = useState<CardContent | null>(null)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [rating, setRating] = useState(false)
  const [rateError, setRateError] = useState<string | null>(null)
  const [nextDueAt, setNextDueAt] = useState<number | null>(null)
  // 同步置位的重入闸：键盘监听闭包里的 rating state 有滞后，连按两下会重复提交评分
  const ratingRef = useRef(false)
  // 已评分（结果区块留在屏上，等「下一题」推进）：store 的 phase 就是为这一态设计的
  const rated = phase === 'rated'

  const dto = queue[index]

  useEffect(() => {
    // 换卡（或从别的模块回到本模块）时重置；phase 已是 'rated' 说明这张卡已评分，直接落在结果态
    setRevealed(useReviewSessionStore.getState().phase === 'rated')
    setLastInput(''); setCorrect(null); setSnapshot(null)
    setStartedAt(Date.now()); setRating(false); ratingRef.current = false
    setRateError(null); setNextDueAt(null)
    if (!dto) return
    let alive = true
    // getWordContent 本身不吞异常（可能 reject），快照失败按「暂无快照」降级
    getWordContent(dto.wordId).then(c => { if (alive) setSnapshot(c) }).catch(() => { if (alive) setSnapshot(null) })
    return () => { alive = false }
  }, [dto?.cardId])

  if (!dto) return null

  const handleSubmit = (input: string) => {
    setLastInput(input)
    setRateError(null)
    const kind = inputKindFor(dto.template)
    if (kind === 'choice') {
      setCorrect(input === String((dto.answer as any).translation ?? ''))
    } else if (kind === 'typed' && dto.template !== 'recall') {
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
    // rated 兜住另一条路：模块切走再切回时 phase 仍是 'rated'，这张卡不能再评一次。
    if (ratingRef.current || rated) return
    ratingRef.current = true
    setRating(true)
    // 会话所属策略决定计分与否：被切到别的策略下查看的会话仍按自己的模式评分
    const mode = useReviewSessionStore.getState().sessionStrategy === 'today' ? 'review' : 'practice'
    let res: RateCardResult
    try {
      res = await rateCard({ cardId: dto.cardId, rating: r, template: dto.template, mode, durationMs: Date.now() - startedAt, retention })
    } catch (e) {
      // 落库失败之外仍有会抛的路径（fsrs_next 的 Tauri invoke 拒绝），同样不前进
      res = { ok: false, error: e instanceof Error ? e.message : String(e), dueAt: null }
    }
    if (!res.ok) {
      // 未 advance，仍是当前卡：松开闸门让用户重试
      setRateError(res.error ?? '评分未保存，请重试')
      setRating(false)
      ratingRef.current = false
      return
    }
    setRateError(null)
    setNextDueAt(res.dueAt)
    // 落库成功后再记账（answerCurrent 同时把 phase 置为 'rated'，结果区块留在屏上），
    // 推进交给「下一题」按钮 / 再按一次评分键（spec §2.3）。
    // lastInput 即作答原文：揭示型与「直接跳过」未经提交，它就是 ''（spec §4.1）。
    answerCurrent(r, lastInput)
  }

  // 揭示后：未评分 → 1 / 2 / 3 评分；已评分 → 同样的键推进下一题（不重复评分）。
  // 读 store 的实时 phase 而非渲染闭包：换卡前的重复按键落在旧闭包里，
  // 此时 phase 已是 answering、ratingRef 仍为 true → 既不会重复评分也不会连跳两题。
  useEffect(() => {
    if (!revealed) return
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i < 0) return
      e.preventDefault()
      if (useReviewSessionStore.getState().phase === 'rated') advance()
      else handleRate(i + 1)
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

      {/* key：换卡即重挂 PromptCard，否则 AnswerInput 的 value / picked 会跨卡残留 */}
      <PromptCard key={dto.cardId} dto={dto} letterHighlight={letterHighlight} disabled={revealed} onSubmit={handleSubmit} />

      {revealed && (
        <>
          <ResultBlock dto={dto} snapshot={snapshot} lastInput={lastInput} correct={correct} nextDueAt={nextDueAt} />
          <RatingBar onRate={handleRate} disabled={rated || rating} />
          {rateError && (
            <span style={{ alignSelf: 'flex-start', fontSize: '12px', color: '#c0705a' }}>{rateError}</span>
          )}
          {rated ? (
            <button
              type="button"
              onClick={() => advance()}
              style={{ alignSelf: 'flex-start', padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-brand)', color: '#fff', cursor: 'pointer', fontSize: '13px' }}
            >
              下一题
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleRate(1)}
              style={{ alignSelf: 'flex-start', fontSize: '12px', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              直接跳过（记为忘了）
            </button>
          )}
        </>
      )}
    </div>
  )
}
