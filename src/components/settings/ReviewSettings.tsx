import { useSettingsStore } from '../../stores/settingsStore'
import { Toggle } from '../ui/Toggle'

// 复习设置（v0.6 §7）：四项 FSRS / 队列参数 + 键入题逐字母标红开关。
// 设置页是 review 的唯一写入方，reviewService 通过 ReviewModule 读同一份 store。
export default function ReviewSettings() {
  const review = useSettingsStore(s => s.review)
  const setReview = useSettingsStore(s => s.setReview)

  return (
    <div className="flex flex-col gap-5">
      <h2 style={{ fontSize: '18px', fontWeight: 600 }}>复习</h2>

      <NumberRow
        label="期望记忆保留率"
        hint="FSRS 唯一的「背多牢 vs 背多快」旋钮。只影响新产生的间隔，历史到期不回溯重算。"
        value={review.retention}
        min={0.8} max={0.95} step={0.01}
        onChange={v => setReview('retention', v)}
      />
      <NumberRow
        label="Leech 连错阈值"
        hint="词条任一卡连错达到该次数即计入薄弱词"
        value={review.leechThreshold}
        min={1} max={20} step={1}
        onChange={v => setReview('leechThreshold', v)}
      />
      <NumberRow
        label="新词额度"
        hint="每轮最多引入的新词数；0 = 只还旧账"
        value={review.newCardQuota}
        min={0} max={50} step={1}
        onChange={v => setReview('newCardQuota', v)}
      />
      <NumberRow
        label="队列上限"
        hint="每轮最多出题数，守护评分输入质量；0 = 不限"
        value={review.queueLimit}
        min={0} max={200} step={5}
        onChange={v => setReview('queueLimit', v)}
      />

      <label className="flex items-center gap-3">
        <Toggle checked={review.letterHighlight} onChange={v => setReview('letterHighlight', v)} />
        <span style={{ fontSize: '13px' }}>键入题逐字母标红</span>
      </label>
    </div>
  )
}

function NumberRow({ label, hint, value, min, max, step, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <span style={{ fontSize: '13px', flex: 1 }}>{label}</span>
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={e => {
            const v = Number(e.target.value)
            if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
          }}
          style={{ width: '90px', padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
        />
      </div>
      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{hint}</span>
    </div>
  )
}
