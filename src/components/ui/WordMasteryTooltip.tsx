import { useEffect, useState } from 'react'
import type { InitialFamiliarity } from '../../lib/review/types'
import { MASTERY_COLORS, masteryBlocks, masteryTooltipModel } from '../../lib/review/masteryScale'
import { masteryTier, weakestStability as weakestOf } from '../../lib/review/mastery'
import { isListenEnabled } from '../../lib/review/ttsGate'
import { getWordCardBreakdown, type CardBreakdownRow } from '../../db/review'

const TEMPLATE_NAMES: Record<string, string> = {
  recognize: '认读', recall: '中→英', english_def: '英释义', cloze: '填空', listen: '听辨',
}

/**
 * 记忆强度的悬停详情（v0.6.5，spec 4.13）。
 *
 * 逐卡明细按需取数：挂载即查一次（Tooltip 只在打开时才渲染 content，故 query 也只发生一次）。
 * 底部两段解释不是装饰——「未开始 ≠ 0 分」与「冷启动回落到熟悉度」是唯一能解释
 * 「读数为什么突然掉下来」的地方，缺了它用户会以为坏了。
 *
 * 取数还带回 `presentable`（该卡当前是否还能出题）与 `lastReviewAt`，**本浮层两个都不渲染**
 * （评审记录的取舍）：这个面板是「记忆强度为什么是这个读数」的说明，不是调度视图。可出题与否、
 * 上次复习时间属于复习队列那一层的关注点，混进来会冲淡面板的主题。
 * `presentable` 为 false 的卡**仍然列出来**：它曾经计入词级读数，从表里抹掉它就解释不了
 * 「读数为什么突然掉下来」——留着一行是那段经历的证据。它自己那一行显示的是**真实**的
 * stability，而它已经不再参与上面的读数（spec §4.13 边界 2：只统计仍可出题的卡）。
 * 于是本面板有一处已知的不自洽：板子解释读数、却不解释这道门控——要解释就得把
 * presentable 也渲染出来，那是另一块面板的事，不在本次范围内。
 */
export default function WordMasteryTooltip({ wordId, weakestStability, familiarity }: {
  wordId: string
  weakestStability: number | null
  familiarity: InitialFamiliarity
}) {
  const [rows, setRows] = useState<CardBreakdownRow[] | null>(null)
  useEffect(() => {
    let cancelled = false
    // presentable 决定下面「最弱一环」取哪几张卡，故它必须与 chip 那个读数用**同一个**听辨门控值
    // （gate 在有 ttsGate 的这一层读一次往下传；src/db 不许 import ttsGate）。漏掉它时，
    // 一个只有 listen 卡的词在这里报不出最弱一环，上面却已经按那张卡算出了读数——自己打架。
    void getWordCardBreakdown(wordId, undefined, { allowListen: isListenEnabled() })
      .then(r => { if (!cancelled && r.ok) setRows(r.data) })
    return () => { cancelled = true }
  }, [wordId])

  const model = masteryTooltipModel({ weakestStability, familiarity })
  const blocks = masteryBlocks(model.tier)
  const color = MASTERY_COLORS[model.tier]
  // 「最弱一环」要与上面那个读数**同一口径**：只在仍可出题的已评分卡里取（spec §4.13 边界 2），
  // 且规则本身只有 weakestStability 一处实现——这里不另写 reduce，否则内容一删，
  // chip 读认读卡而这一行报填空卡，两处自己打架。
  const rated = (rows ?? []).filter(r => r.presentable && r.stability !== null)
  const weakestValue = weakestOf(rated.map(r => r.stability))
  const weakest = weakestValue === null ? null : rated.find(r => r.stability === weakestValue) ?? null

  return (
    <div style={{ minWidth: 240 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="stat-num" style={{ fontSize: 15 }}>
          {model.score === null ? '无调度记录' : model.score}
        </span>
        {model.score !== null && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>/ 100 · {model.tierName}</span>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2.5 }}>
          {Array.from({ length: blocks.total }, (_, i) => (
            <i key={i} style={{
              width: 7, height: 9, borderRadius: 2, display: 'inline-block',
              background: i < blocks.filled ? color : MASTERY_COLORS[0],
            }} />
          ))}
        </span>
      </div>

      {weakest && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          最弱一环：<b style={{ color: 'var(--color-text-primary)' }}>{TEMPLATE_NAMES[weakest.template] ?? weakest.template}</b>
          {' · '}<span className="stat-num">{Math.round(weakest.stability!)}</span> 天
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--color-border)', margin: '10px 0 8px' }} />
          {rows.map(r => {
            const tier = r.stability === null ? 0 : masteryTier(r.stability)
            const b = masteryBlocks(tier)
            return (
              <div key={r.template} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '3px 0' }}>
                <span style={{ width: 52, fontSize: 12.5 }}>{TEMPLATE_NAMES[r.template] ?? r.template}</span>
                {r.stability === null
                  ? <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>— 未开始</span>
                  : <span style={{ display: 'inline-flex', gap: 2.5 }}>
                      {Array.from({ length: b.total }, (_, i) => (
                        <i key={i} style={{
                          width: 7, height: 9, borderRadius: 2, display: 'inline-block',
                          background: i < b.filled ? MASTERY_COLORS[tier] : MASTERY_COLORS[0],
                        }} />
                      ))}
                    </span>}
                {r.stability !== null && (
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
                    <span className="stat-num">{Math.round(r.stability)}</span> 天
                  </span>
                )}
              </div>
            )
          })}
        </>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', lineHeight: 1.6, marginTop: 9 }}>
        {model.score === null
          ? '还没有任何题型被评分，暂按收录时自报的熟悉度显示；首评之后以 FSRS 为准。'
          : '词级读数取仍能出题的已评分题型里最弱的一张。未开始的题型不是 0 分，它还没被评过，不参与取最弱——它第一次评分时读数可能掉下来，那是真实情况第一次被测到。内容被删掉的题型同样不参与：它已经出不了题了，拖着的读数是假的。'}
      </div>
    </div>
  )
}
