import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getConfig, setConfig } from '../../lib/config'
import { useSettingsStore } from '../../stores/settingsStore'
import { Toggle } from '../ui/Toggle'
import { subscribe, getProbe, type VoiceProbe } from '../../lib/review/ttsGate'

/** 后端 → 面向用户的来源说法。用用户能读懂的话点名后端，「装了却读不到」的反馈
 *  才能说清当时走的是哪条路（spec §6.4 的验收文案：来源写作「系统 SAPI5」等）。 */
const BACKEND_LABEL: Record<string, string> = {
  winrt: 'Windows 系统语音',
  sapi: '系统 SAPI5',
  native: '系统语音',
}

// 复习设置（v0.6 §7 + v0.6.1 §2.6 / §2.7 + v0.6.2 §2.6 / §6.4）。
// 版式：左列＝标签（第一行）＋ 说明（第二行）两行一栏，右侧控件垂直居中于那两行。
export default function ReviewSettings() {
  const review = useSettingsStore(s => s.review)
  const setReview = useSettingsStore(s => s.setReview)
  // 探测结果在启动时异步写入，故用订阅而不是直接读——否则设置页在结果落地前挂载时
  // 会一直显示「未探测」，用户看不到诊断信息（v0.6.2 §6.4）。
  const probe = useSyncExternalStore(subscribe, getProbe)

  // `ready` 与 `voice` 必须分开：`voice` 为 null 是**合法值**（「系统默认」），
  // 拿它当「配置还没读回来」的门会让音色行永不渲染。
  const [ready, setReady] = useState(false)
  const [rate, setRate] = useState(1.0)
  const [voice, setVoice] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)

  // 写配置串成一串 promise：连敲语速 `1.5` 会连发多次 `setConfig`，交错的话
  // 后一次写的返回值可能先落地，把界面显示拨回一个中间值。串行化后顺序与敲击
  // 一致，本地状态也始终来自各自那次写返回的合并结果（与 TrayWindowSettings 同形）。
  const chain = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    void getConfig().then(c => { setRate(c.tts.rate); setVoice(c.tts.voice); setReady(true) })
  }, [])

  /** 改配置 + 用新值试听一次——「点了没变」是这个功能最常见的困惑。
   *  试听失败要把原因显示出来（spec §4.4「前端显示红字」）：音色被系统卸载时
   *  静默吞掉的话，用户看到的是「选了下拉框但没声音」，无从判断是设置没生效还是系统没装。
   *
   *  试听只给**最终settled 的值**出一次声：这次写的 promise 一旦不再是链条末端
   *  （说明此刻已有更新的写排在其后），就不再试听——否则敲 `1.5` 会连响好几声。 */
  const applyTts = (patch: { voice?: string | null; rate?: number }) => {
    const run = chain.current.then(async () => {
      setTtsError(null)
      try {
        const next = await setConfig({ tts: patch })
        setVoice(next.tts.voice)
        setRate(next.tts.rate)
        if (chain.current === run) await invoke('speak', { text: 'detrimental' })
      } catch (e) {
        setTtsError(String(e))
      }
    })
    chain.current = run
  }

  return (
    <div className="flex flex-col gap-5">
      <ListenStatus probe={probe} />

      {probe?.available && ready && (
        <>
          <VoiceRow current={voice} onChange={v => void applyTts({ voice: v })} errorText={ttsError} />
          <NumberRow
            label="朗读语速"
            hint="1.0 为常速。改动即时生效，只影响之后的朗读。"
            value={rate}
            min={0.5} max={2.0} step={0.1}
            onChange={v => void applyTts({ rate: v })}
          />
        </>
      )}

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

interface VoiceInfo { name: string; language: string | null }

/**
 * 音色与语速（v0.7.0 §4.6）。**只在听辨题可用时渲染**：听辨题因系统没有英文音色
 * 下线时，`ListenStatus` 已经给出「装好后重启软件即可上线」与双平台安装路径，
 * 这时再摆一个枚举不出任何音色的下拉是误导——与 ListenStatus 注释里
 * 「在还不知道系统里有没有英文音色之前，让用户去装语音包是误导」是同一条判断。
 */
function VoiceRow({ current, onChange, errorText }: {
  current: string | null; onChange: (v: string | null) => void; errorText: string | null
}) {
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  useEffect(() => {
    void invoke<VoiceInfo[]>('list_english_voices').then(setVoices).catch(() => setVoices([]))
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px' }}>听辨题音色</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
          选中后立即生效并试听，重启后保持。
        </div>
        {errorText && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: 2 }}>{errorText}</div>
        )}
      </div>
      <select
        aria-label="听辨题音色"
        value={current ?? ''}
        onChange={e => onChange(e.target.value || null)}
        style={{
          width: 240, padding: '5px 8px', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)',
          fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)',
        }}
      >
        <option value="">系统默认</option>
        {voices.map(v => <option key={v.name} value={v.name}>{v.name}{v.language ? `（${v.language}）` : ''}</option>)}
      </select>
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
        style={{ width: '90px', flexShrink: 0, padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
      />
    </div>
  )
}
