import { useEffect, useRef, useState } from 'react'
import PromptCard, { inputKindFor, typedTarget } from './PromptCard'
import RatingBar from './RatingBar'
import ResultBlock from './ResultBlock'
import ArenaNavBar from './ArenaNavBar'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import { rateCard, type CardContent, type RateCardResult } from '../../services/reviewService'
import { compareTyped } from '../../lib/review/typed'
import { currentAnswered, canGoBack, canGoForward, answeredCount } from '../../lib/review/nav'
import { getWordContent } from '../../db/review'

// 评分档位的中文标签（回看态只读标签用）。4 是预留的「轻松」档，本期无 UI。
const RATING_LABELS: Record<number, string> = { 1: '忘了', 2: '模糊', 3: '记得', 4: '轻松' }

/**
 * 答题态。三段：作答（红绿提示）→ 三键评分 → 结果区块停在屏上等「下一题」推进。
 * 局部 revealed 驱动「作答前 / 作答后」；store 的 phase 的 'rated' 驱动「已评分 / 待推进」。
 */
export default function ReviewArena() {
  const answeredList = useReviewSessionStore(s => s.answered)
  const { queue, index, phase, answerCurrent, advance, reset, setIndex } = useReviewSessionStore()
  const letterHighlight = useSettingsStore(s => s.review.letterHighlight)
  const retention = useSettingsStore(s => s.review.retention)

  // 当前这张卡已作答——回看旧题与刚评完分都为真，用 phase 再分开
  const answeredNow = currentAnswered(queue, answeredList, index)
  // 回看态：已答过、且不是「刚评完待推进」那一态（spec §4.2）
  const past = answeredNow && phase === 'answering'
  // 刚评完待推进：三键已隐、等「下一题」
  const rated = phase === 'rated'
  // 停在队尾：导航条右箭头在此恒为灰（canGoForward：index+1 >= queue.length），故回看态的最后一题
  // 需要自己的小结入口。箭头本身不动——nav.test.ts 钉住了「不能越过最后一张」。
  const atTail = index === queue.length - 1

  // 初值随 store：模块切走再切回时本组件会重挂，若这张卡已评分就直接停在结果态，不让它被再评一次
  const [revealed, setRevealed] = useState(() => currentAnswered(
    useReviewSessionStore.getState().queue,
    useReviewSessionStore.getState().answered,
    useReviewSessionStore.getState().index,
  ))
  const [lastInput, setLastInput] = useState('')
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [snapshot, setSnapshot] = useState<CardContent | null>(null)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [rating, setRating] = useState(false)
  const [rateError, setRateError] = useState<string | null>(null)
  const [nextDueAt, setNextDueAt] = useState<number | null>(null)
  // 同步置位的重入闸：键盘监听闭包里的 rating state 有滞后，连按两下会重复提交评分
  const ratingRef = useRef(false)

  const dto = queue[index]

  useEffect(() => {
    // 换卡（或从别的模块回到本模块）时重置；这张卡在 answered 里就直接落在结果态（揭示 + 回放）
    const st = useReviewSessionStore.getState()
    const done = st.answered.find(a => a.cardId === dto?.cardId)
    setRevealed(Boolean(done))
    setLastInput(done?.input ?? ''); setCorrect(null); setSnapshot(null)
    setStartedAt(Date.now()); setRating(false); ratingRef.current = false
    setRateError(null); setNextDueAt(null)
    if (!dto) return
    let alive = true
    // getWordContent 本身不吞异常（可能 reject），快照失败按「暂无快照」降级
    getWordContent(dto.wordId).then(c => { if (alive) setSnapshot(c) }).catch(() => { if (alive) setSnapshot(null) })
    return () => { alive = false }
  }, [dto?.cardId])

  if (!dto) return null

  // 回看态：从记账里回放当时的输入（spec §4.1）
  const pastEntry = answeredList.find(a => a.cardId === dto.cardId)

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

  // input 由调用方显式给出： RatingBar / 键盘传用户实际提交的作答原文（选择题＝选中项，键入题＝键入内容）；
  // 「跳过」传 ''——那条路径刻意丢弃被放弃的作答，回看时不得把它当作用户的答案重放（spec §4.1）。
  const handleRate = async (r: number, input: string) => {
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
    // 「跳过」在揭示前就能按，那条路径没有 handleSubmit 把 revealed 置起；
    // 评分成功即视为已揭示，好让「刚评完待推进」这一态真的露出来（结果区 +「下一题」，无三键）。
    // 常规评分路径 revealed 本就为 true，这句是幂等的。
    setRevealed(true)
    // 落库成功后再记账（answerCurrent 同时把 phase 置为 'rated'，结果区块留在屏上），
    // 推进交给「下一题」按钮 / 再按一次评分键（spec §2.3）。
    answerCurrent(r, input)
  }

  // 揭示后：未评分 → 1 / 2 / 3 评分；已评分 → 同样的键推进下一题（不重复评分）。
  // 回看态不挂监听：评分快捷键失效，否则按 1/2/3 会误评当前题。
  // 刚评完分（past 为假、phase === 'rated'）照旧挂上，那一态的键就该推进队列。
  // 读 store 的实时 phase 而非渲染闭包：换卡前的重复按键落在旧闭包里，
  // 此时 phase 已是 answering、ratingRef 仍为 true → 既不会重复评分也不会连跳两题。
  useEffect(() => {
    if (!revealed || past) return
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i < 0) return
      e.preventDefault()
      if (useReviewSessionStore.getState().phase === 'rated') advance()
      else void handleRate(i + 1, lastInput)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, past, dto.cardId, lastInput])

  const handleEnd = async () => {
    const ok = await useUiStore.getState().confirm({
      title: '结束本轮回合？',
      message: `已答的 ${answeredCount(answeredList)} 道题照常保存，但本轮不会生成小结，剩余 ${Math.max(0, queue.length - answeredCount(answeredList))} 题留到下次。`,
      confirmLabel: '结束并退出',
      danger: true,
    })
    if (ok) reset()
  }

  return (
    <div className="flex flex-col gap-6 p-8" style={{ maxWidth: '960px' }}>
      <div>
        <ArenaNavBar
          index={index}
          total={queue.length}
          canBack={canGoBack(index)}
          canForward={canGoForward(queue, answeredList, index)}
          onBack={() => setIndex(index - 1)}
          onForward={() => setIndex(index + 1)}
          onEnd={() => void handleEnd()}
        />
        <div style={{ height: '3px', background: 'var(--color-border)', borderRadius: '2px' }}>
          <div style={{ width: `${((index + 1) / queue.length) * 100}%`, height: '100%', background: 'var(--color-brand)', borderRadius: '2px' }} />
        </div>
      </div>

      {/* key：换卡即重挂 PromptCard，否则 AnswerInput 的 value / picked 会跨卡残留 */}
      <PromptCard
        key={dto.cardId}
        dto={dto}
        letterHighlight={letterHighlight}
        disabled={revealed}
        revealedInput={pastEntry?.input}
        onSkip={() => void handleRate(1, '')}
        onSubmit={handleSubmit}
      />

      {rateError && (
        // 错误行放在 revealed 块**之外**、题面之下。「跳过」按钮在揭示前就能按（spec §2.4），
        // 而 setRevealed(true) 只在评分成功后跑：跳过落库失败时 revealed 仍为假、整块结果区
        // 不渲染，错误若只挂在块内就成「点了没反应」（题面不变、跳过还在、无提示）。
        // 评分成功时 setRateError(null) 已把它清掉，故成功后的「跳过」不会留残影。
        <span style={{ alignSelf: 'flex-start', fontSize: '12px', color: '#c0705a' }}>{rateError}</span>
      )}

      {revealed && (
        <>
          <ResultBlock dto={dto} snapshot={snapshot} lastInput={lastInput} correct={correct} nextDueAt={nextDueAt} />
          {/* 三键：仅「已揭示且未作答」时出现。跳过即已评分，故跳过路径不出现三键（spec §2.4） */}
          {!answeredNow && <RatingBar onRate={r => void handleRate(r, lastInput)} disabled={rating} />}
          {past ? (
            // 回看态：只读回放。一般位置向前靠导航条右箭头；但整轮已答完又翻回最后一题时
            // canGoForward 在队尾恒为 false（nav.test.ts 钉住「箭头不越界」），右箭头被灰掉，
            // 而「结束回合」按设计不出小结——那轮小结就彻底不可达了。补一颗尾部专属的
            // 「查看小结」：它调的正是 advance()，在队尾会把 phase 置成 'summary'。
            // 按钮与「下一题」同形同位（下一题本就是这一态的正常控件），两态互斥。
            atTail ? (
              <button
                type="button"
                onClick={() => advance()}
                style={{ alignSelf: 'flex-start', padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-brand)', color: '#fff', cursor: 'pointer', fontSize: '13px' }}
              >
                查看小结
              </button>
            ) : (
              <span style={{ alignSelf: 'flex-start', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                本题评分：{RATING_LABELS[pastEntry?.rating ?? 0] ?? '—'}
              </span>
            )
          ) : rated ? (
            <button
              type="button"
              onClick={() => advance()}
              style={{ alignSelf: 'flex-start', padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-brand)', color: '#fff', cursor: 'pointer', fontSize: '13px' }}
            >
              下一题
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
