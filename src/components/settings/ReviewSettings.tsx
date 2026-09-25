import { useSettingsStore } from '../../stores/settingsStore'
import { Toggle } from '../ui/Toggle'
import { isListenEnabled } from '../../lib/review/ttsGate'

// 复习设置（v0.6 §7 + v0.6.1 §2.6 / §2.7）。
// 版式：左列＝标签（第一行）＋ 说明（第二行）两行一栏，右侧控件垂直居中于那两行。
export default function ReviewSettings() {
  const review = useSettingsStore(s => s.review)
  const setReview = useSettingsStore(s => s.setReview)
  // 探测结果在启动时写入，这里是纯读；探测失败 / 未返回一律视为不可用（与组卷同一口径）
  const listenOn = isListenEnabled()

  return (
    <div className="flex flex-col gap-5">
      {!listenOn && (
        <div style={{
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface-raised)', padding: '10px 12px',
          fontSize: '12px', lineHeight: 1.8, color: 'var(--color-text-secondary)',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', marginBottom: 4 }}>未检测到英文语音，听辨题型已下线</div>
          装好后重启即可上线：Windows 设置 → 时间和语言 → 语言和区域 → English (US) → 语言选项 → 下载「语音」包。
          macOS：系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音，免费下载 Ava / Zoe 等增强音色。
        </div>
      )}

      <NumberRow
        label="期望记忆保留率"
        hint="调高 ＝ 记得更牢、复习更频繁；调低 ＝ 复习更少、更容易忘。只影响新产生的间隔，历史到期不回溯重算。右侧可填 0.80 – 0.95。"
        value={review.retention}
        min={0.8} max={0.95} step={0.01}
        onChange={v => setReview('retention', v)}
      />
      <NumberRow
        label="薄弱词阈值"
        hint="连错达到薄弱词标准的错误次数"
        value={review.leechThreshold}
        min={1} max={20} step={1} integer
        onChange={v => setReview('leechThreshold', v)}
      />
      <NumberRow
        label="新词额度"
        hint="每轮最多引入的新词数，0 = 不复习新词"
        value={review.newCardQuota}
        min={0} max={50} step={1} integer
        onChange={v => setReview('newCardQuota', v)}
      />
      <NumberRow
        label="队列上限"
        hint="每轮最多出题数，0 = 不限"
        value={review.queueLimit}
        min={0} max={200} step={5} integer
        onChange={v => setReview('queueLimit', v)}
      />

      {/* 开关行与上面四行的控件右边缘对齐：左列同样是「标签 + 说明」两行结构 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px' }}>键入题逐字母标红</div>
        </div>
        <div style={{ width: 90, display: 'flex', justifyContent: 'center' }}>
          <Toggle checked={review.letterHighlight} onChange={v => setReview('letterHighlight', v)} />
        </div>
      </div>
    </div>
  )
}

function NumberRow({ label, hint, value, min, max, step, integer, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; step: number
  /** 整型项：step 只是输入框提示，不拦手输，故在这里显式取整（保留率是有意的小数，不传）。 */
  integer?: boolean
  onChange: (v: number) => void
}) {
  return (
    // items-center：输入框垂直居中于左列那两行之中（v0.6.1 §2.7）。
    // 之前输入框与第一行标签对齐、说明文字溢出到框下方，视觉重心偏上。
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: '13px' }}>{label}</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{hint}</span>
      </div>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => {
          const v = Number(e.target.value)
          if (Number.isNaN(v)) return
          const clamped = Math.min(max, Math.max(min, v))
          onChange(integer ? Math.round(clamped) : clamped)
        }}
        style={{ width: '90px', flexShrink: 0, padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
      />
    </div>
  )
}
