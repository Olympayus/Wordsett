import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getConfig, setConfig } from '../../lib/config'
import { subscribe, getProbe } from '../../lib/review/ttsGate'
import NumberRow from './NumberRow'
import SpeakButton from '../ui/SpeakButton'

interface VoiceInfo { name: string; language: string | null }

/** 试听的样词。沿用 spec 指定的那一个：多音节、语速差异听得出来。 */
const SAMPLE_WORD = 'detrimental'

/** 小节标题：命名这一节**装的是什么**（音色与语速），而不是复述分区名「语音」。 */
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)',
}

/** invoke 的 reject 值类型不固定（Rust 侧是 `Result<_, String>`，但插件层可能给 Error）。 */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 语音（v0.7.0 §4.6，2026-10-03 由「复习」分区独立出来）。
 *
 * 独立的两条理由：
 * 1. 音色与语速服务的是**所有朗读**——单词发音（词条卡、词典页的喇叭）和听辨题共用同一个
 *    `speak`。挂在「复习」里等于把它说成听辨题专属，而听辨题因系统没有英文音色下线时，
 *    单词发音其实照样能用。
 * 2. 因此这里**不再有 `probe.available` 门控**。原先那道门的理由是「枚举不出音色的下拉是
 *    误导」，那理由现在由下面 `voices` 为空时的一行说明来承担——比整块消失更准确。
 *
 * 改动**只写配置、不出声**：试听改由标题旁的喇叭按钮触发（2026-10-03 用户决定）。
 * 于是「音色被系统卸载」这条错误只可能在点喇叭时浮现——那正是一个用户主动动作，
 * 比原先「改一下就自动播」更容易把红字和它的起因联系起来。
 *
 * Task 14：移动形态（`variant="mobile"`；v0.7.10 起语义从「手机」扩为「Android 手机或平板」，
 * 平板复用桌面外壳但调用点按 `isDesktop` 传 mobile）。Android 的 TTS 只到 locale 级，没有可
 * 枚举的音色名，音色选择本就是空下拉——故移动形态不渲染 `<select>`，改一行「系统默认（在
 * 系统设置中更换）」。系统语音探测失败时把 `probe.reason` 与一条系统设置指引摆出来，并把语速与
 * 试听置灰：这两项在系统 TTS 不可用时改了也不会出声。`probe === null` 是启动瞬间的
 * 「尚未探测」，按中性处理（不报警、不置灰），与 `ListenStatus` 的三态判据一致。
 */
export default function VoiceSettings({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const mobile = variant === 'mobile'
  // 与 ReviewSettings 同一来源：探测结果在启动时异步落地，必须订阅而不是读一次。
  // 桌面形态不消费它（桌面行为保持不变），但 hooks 不能条件调用，故照常订阅。
  const probe = useSyncExternalStore(subscribe, getProbe)
  // 只有「探测完成且明确不可用」才置灰；null = 尚未探测，按中性处理。
  const ttsUnavailable = probe !== null && !probe.available

  const [ready, setReady] = useState(false)
  const [voice, setVoice] = useState<string | null>(null)
  const [rate, setRate] = useState(1.0)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  // 写配置串成一串 promise：连敲语速 `1.5` 会连发多次 `setConfig`，交错的话
  // 后一次写的返回值可能先落地，把界面显示拨回一个中间值。串行化后顺序与敲击一致，
  // 本地状态也始终来自各自那次写返回的合并结果（与 TrayWindowSettings 同形）。
  // 试听也挂在这条链上：否则「改完立刻点喇叭」会用到还没落盘的值。
  const chain = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    // `voice` 为 null 是**合法值**（「系统默认」），故「配置读回来了没有」另用一个 `ready`
    // 标记——拿 voice 当门会让「系统默认」这一档永不渲染。
    void getConfig().then(c => { setVoice(c.tts.voice); setRate(c.tts.rate); setReady(true) })
    // 移动形态（Android 手机与平板）没有音色下拉，枚举结果无人消费；Android 侧本来也恒返回空表，省掉这趟 IPC。
    if (mobile) return
    void invoke<VoiceInfo[]>('list_english_voices').then(setVoices).catch(() => setVoices([]))
  }, [mobile])

  const patch = (p: { voice?: string | null; rate?: number }) => {
    chain.current = chain.current.then(async () => {
      setError(null)
      try {
        const next = await setConfig({ tts: p })
        setVoice(next.tts.voice)
        setRate(next.tts.rate)
      } catch (e) {
        // 与 TrayWindowSettings 同一判断：这里失败＝**什么都没存**（`set_patch` 原子写、
        // 只在成功后更新缓存），所以控件停在旧值是如实的，红字只需说清原因。
        setError(`设置未保存：${errText(e)}`)
      }
    })
  }

  /** 点喇叭试听：不传 rate / voice，由 Rust 侧读 `shortcuts.json` 的当前值。
   *  失败必须显示出来（spec §4.4 的「前端显示红字」）——`speakWord` 那条路会静默吞掉，
   *  所以这里走 `onPlay` 自己接。 */
  const preview = () => {
    chain.current = chain.current.then(async () => {
      setError(null)
      try {
        await invoke('speak', { text: SAMPLE_WORD })
      } catch (e) {
        setError(errText(e))
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={SECTION_TITLE}>音色与语速</div>
        {/* 与标题同一轴；`tertiary` 在这里偏淡（标题是 `--text-base` 加粗的近黑），
            故用 secondary，靠 hover 的品牌色给出可点性。 */}
        <SpeakButton
          text={SAMPLE_WORD}
          label="试听"
          size={16}
          tone="secondary"
          onPlay={preview}
          disabled={mobile && ttsUnavailable}
        />
      </div>

      {/* 移动形态：系统 TTS 只到 locale 级，没有可选音色；固定一行说明设置入口在系统里。 */}
      {mobile && (
        <div style={{ fontSize: '13px' }}>音色：系统默认（在系统设置中更换）</div>
      )}

      {/* 探测完成且不可用才报警；null（尚未探测）不显示任何东西。 */}
      {mobile && ttsUnavailable && (
        <div style={{
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface-raised)', padding: '10px 12px',
          fontSize: '12px', lineHeight: 1.7, color: 'var(--color-text-secondary)',
        }}>
          <div>{probe?.reason ?? '系统语音不可用'}</div>
          <div style={{ marginTop: 4 }}>系统设置 → 语言与输入 → 文字转语音</div>
        </div>
      )}

      {ready && (
        <>
          {!mobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px' }}>朗读音色</div>
              </div>
              <select
                aria-label="朗读音色"
                value={voice ?? ''}
                onChange={e => patch({ voice: e.target.value || null })}
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
          )}

          <NumberRow
            label="朗读语速"
            value={rate}
            min={0.5} max={2.0} step={0.1}
            onChange={v => patch({ rate: v })}
            disabled={mobile && ttsUnavailable}
          />
        </>
      )}

      {error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</div>}
    </div>
  )
}
