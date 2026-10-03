import { useSyncExternalStore } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { Toggle } from '../ui/Toggle'
import { subscribe, getProbe, type VoiceProbe } from '../../lib/review/ttsGate'
import NumberRow from './NumberRow'

/** 后端 → 面向用户的来源说法。用用户能读懂的话点名后端，「装了却读不到」的反馈
 *  才能说清当时走的是哪条路（spec §6.4 的验收文案：来源写作「系统 SAPI5」等）。 */
const BACKEND_LABEL: Record<string, string> = {
  winrt: 'Windows 系统语音',
  sapi: '系统 SAPI5',
  native: '系统语音',
}

// 复习设置（v0.6 §7 + v0.6.1 §2.6 / §2.7 + v0.6.2 §2.6 / §6.4）。
// 版式：左列＝标签（第一行）＋ 说明（第二行）两行一栏，右侧控件垂直居中于那两行。
//
// 2026-10-03：音色与语速搬去了独立的「语音」分区（见 VoiceSettings）——它们服务的是
// 所有朗读，不只是听辨题。本分区只留「听辨题能不能出」这件事（ListenStatus）与复习参数。
export default function ReviewSettings() {
  const review = useSettingsStore(s => s.review)
  const setReview = useSettingsStore(s => s.setReview)
  // 探测结果在启动时异步写入，故用订阅而不是直接读——否则设置页在结果落地前挂载时
  // 会一直显示「未探测」，用户看不到诊断信息（v0.6.2 §6.4）。
  const probe = useSyncExternalStore(subscribe, getProbe)

  return (
    <div className="flex flex-col gap-5">
      <ListenStatus probe={probe} />

      {/* 开关行只有单行标签，控件右端与下面四个数字框的右边缘对齐（flex-end，不是居中） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px' }}>标题栏显示待复习数量</div>
        </div>
        <div style={{ width: 90, display: 'flex', justifyContent: 'flex-end' }}>
          <Toggle
            aria-label="标题栏显示待复习数量"
            checked={review.showDueBadge}
            onChange={v => setReview('showDueBadge', v)}
          />
        </div>
      </div>

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

      {/* 开关行只有单行标签，控件右端与上面四行数字框的右边缘对齐（flex-end，不是居中） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px' }}>键入题逐字母标红</div>
        </div>
        <div style={{ width: 90, display: 'flex', justifyContent: 'flex-end' }}>
          <Toggle aria-label="键入题逐字母标红" checked={review.letterHighlight} onChange={v => setReview('letterHighlight', v)} />
        </div>
      </div>
    </div>
  )
}

/**
 * 听辨题型的状态块（spec §6.4）。
 *
 * 三态而非两态。探测结果是异步 Tauri IPC 落地的，设置页可能在它落地**之前**就被打开
 * （冷启动后一次导航即到），所以「还没探测」必须与「探测了、不可用」分开讲：
 * 早先的 `??` 回退把永久态的标题（「已下线」）和临时态的正文（「正在检测…」）叠在一起，
 * 同一屏既说功能已下线、又说正在检测。探测未返回时同样不该甩出安装指引——
 * 在还不知道系统里有没有英文音色之前，让用户去装语音包和事后说「装好了还是不行」一样误导。
 *
 * 已下线的版式与文案由 spec §2.6 定死，不随本段改动漂移：标题、Rust 侧 reason、
 * 「装好后重启软件即可上线」单独成行，其下 Windows / macOS 两条并列。
 * 可用时显示生效的音色与来源——这才是「装了却读不到」这类问题的可诊断形态：
 * 用户能看到应用到底看见了什么，而不是只被告知「没检测到」。
 *
 * 2026-10-03：本块**留在「复习」分区**（音色设置已搬走）。留在这里是因为它答的是
 * 「听辨题能不能出」——一个复习侧的问题；而它报出的「英文音色：xxx」是探测结果，
 * 不是用户的设置项。
 */
function ListenStatus({ probe }: { probe: VoiceProbe | null }) {
  return (
    <div style={{
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface-raised)', padding: '10px 12px',
      fontSize: '12px', lineHeight: 1.8, color: 'var(--color-text-secondary)',
    }}>
      {probe === null ? (
        <div>正在检测系统语音…</div>
      ) : probe.available ? (
        <>
          <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', marginBottom: 4 }}>
            听辨题型可用
          </div>
          <div>
            英文音色：{probe.voice ?? '系统默认'}
            {probe.backend ? `（来源：${BACKEND_LABEL[probe.backend] ?? probe.backend}）` : ''}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', marginBottom: 4 }}>
            听辨题型已下线
          </div>
          <div>{probe?.reason ?? '正在检测系统语音…'}</div>
          <div style={{ marginTop: 6 }}>装好后重启软件即可上线</div>
          <div>Windows：设置 → 时间和语言 → 语言和区域 → English (US) → 语言选项 → 下载「语音」包</div>
          <div>macOS：系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音，免费下载 Ava / Zoe 等增强音色</div>
        </>
      )}
    </div>
  )
}
