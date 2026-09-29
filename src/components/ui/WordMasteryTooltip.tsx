import { useEffect, useState } from 'react'
import type { InitialFamiliarity } from '../../lib/review/types'
import { MASTERY_COLORS, masteryBlocks, masteryTooltipModel } from '../../lib/review/masteryScale'
import { masteryTier } from '../../lib/review/mastery'
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
 */
export default function WordMasteryTooltip({ wordId, weakestStability, familiarity }: {
  wordId: string
  weakestStability: number | null
  familiarity: InitialFamiliarity
}) {
  const [rows, setRows] = useState<CardBreakdownRow[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void getWordCardBreakdown(wordId).then(r => { if (!cancelled && r.ok) setRows(r.data) })
    return () => { cancelled = true }
  }, [wordId])

  const model = masteryTooltipModel({ weakestStability, familiarity })
  const blocks = masteryBlocks(model.tier)
  const color = MASTERY_COLORS[model.tier]
  const rated = (rows ?? []).filter(r => r.stability !== null)
  const weakest = rated.length === 0 ? null
    : rated.reduce((a, b) => (b.stability! < a.stability! ? b : a))

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
          {' · '}{Math.round(weakest.stability!)} 天
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
                    {Math.round(r.stability)} 天
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
          : '词级读数取已评分题型里最弱的一张。未开始的题型不是 0 分，它还没被评过，不参与取最弱——它第一次评分时读数可能掉下来，那是真实情况第一次被测到。'}
      </div>
    </div>
  )
}
