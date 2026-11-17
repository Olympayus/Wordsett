import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import RadioMark from '../ui/RadioMark'
import Icon from '../icons'
import { DashMark } from '../entry/Mark'
import { FIELD_LABEL_STYLE } from '../../lib/labelStyle'
import { defaultAttachKey, definitionGroups, type DefinitionLeaf } from '../../lib/collectorTree'
import { libraryLocationIn } from '../../lib/collected'
import { appendExampleUnderDefinition } from '../../services/wordService'
import { getWordByLemma } from '../../db/words'
import { usePendingExampleStore } from '../../stores/pendingExampleStore'
import { useWordStore } from '../../stores/wordStore'
import type { DictionaryField } from '../../types/dictionary'

/**
 * 词典详情页的「划词例句」条（v0.7.9）。
 *
 * 句子模式下小窗点「打开详情页」时，Rust 的 `open-dict` 事件带着整句原文一起来；
 * `App` 把它存进 `pendingExampleStore`，本组件在详情页顶部出一条横幅：句子 + 释义单选 +
 * 「作为例句加入此释义」——小窗里能做的事（把整句挂到某条释义下），详情页里同样能做。
 *
 * **本条的按钮只写例句，绝不收录 / 合并任何东西**（用户裁定）：不 `ensureWord`、
 * 不 `mergeWordFields`——「把词或释义加进工作台」是导航栏右上角「添加至…」的职责。
 * 因此加入的前提是词条与那条释义都已在库里：
 * - 词不在库 → 行内提示先去「添加至…」收录，按钮不可用；
 * - 词在库但没有这条释义（词典有这个义项、用户当年没收）→ `appendExampleUnderDefinition`
 *   返回 false，行内提示先收录该释义。
 *
 * 关闭（右上角 ×）＝不添加：只清掉 pending，不写任何东西。
 */

const STATUS_COPY = {
  done: '已作为例句加入此释义',
  noWord: '该词还没有加入词库，请先用右上角的「添加至…」收录，再来挂例句',
  noDefinition: '该词条中还没有这条释义，请先用「添加至…」收录该释义，再来挂例句',
  failed: '加入例句失败，请重试',
} as const

type Status = 'idle' | keyof typeof STATUS_COPY

export default function GrabbedSentenceBar({ word, fields }: {
  word: string
  fields: DictionaryField[]
}) {
  const pending = usePendingExampleStore(s => s.pending)
  const groups = useMemo(() => definitionGroups(fields).filter(g => g.leaves.length > 0), [fields])
  const [attachKey, setAttachKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  // 词是否已在库（活订阅）：不在库时本条只展示、不提供动作——「加进工作台」归导航栏的
  // 「添加至…」，这里绝不代劳（用户裁定）。
  const inLibrary = useWordStore(s => libraryLocationIn(s.libraryIndex, word) !== null)

  // 换词 / 换一次抓取：默认归属与状态都重新开始（本组件常驻在详情页里，word 会变）。
  useEffect(() => {
    setAttachKey(defaultAttachKey(groups))
    setStatus('idle')
  }, [groups])

  const leaf: DefinitionLeaf | null = useMemo(() => {
    if (attachKey === null) return null
    for (const group of groups) {
      const found = group.leaves.find(l => l.key === attachKey)
      if (found) return found
    }
    return null
  }, [groups, attachKey])

  const dismiss = useCallback(() => usePendingExampleStore.getState().clear(), [])

  const handleAttach = useCallback(async () => {
    if (!pending || !leaf || busy) return
    setBusy(true)
    setStatus('idle')
    try {
      // 只取库里的词条，**不创建**：ensureWord 会顺手把词加进工作台，那是导航栏的职责。
      // 全库按 normalized_lemma 查（当前模块的词表可能只装了工作区或储藏库一侧）。
      const found = await getWordByLemma(word)
      if (!found.ok || !found.data) {
        setStatus('noWord')
        return
      }
      const attached = await appendExampleUnderDefinition(
        found.data.id,
        {
          key: leaf.label === '中文释义' ? 'chinese_definition' : 'english_definition',
          value: leaf.value,
        },
        pending.sentence,
      )
      if (!attached) {
        // 词典有这个义项、但用户当年没收进词条：不做隐式合并，提示先走「添加至…」。
        setStatus('noDefinition')
        return
      }
      // 词表 / 索引刷新（只读刷新，不新增词条）：词条卡片与工作区能看到这条例句。
      await useWordStore.getState().loadWords().catch(() => {})
      setStatus('done')
      // 让成功态停留一瞬再收起：立刻卸载会让用户看不到「刚才那一下发生了什么」。
      setTimeout(() => usePendingExampleStore.getState().clear(), 1100)
    } catch (e) {
      console.error('[detail] 加入划词例句失败', e)
      setStatus('failed')
    } finally {
      setBusy(false)
    }
  }, [pending, leaf, busy, word])

  // 只在「带句子的抓取」打开的那个词上出现；fields 没到时先不出（组还没算）。
  if (!pending || pending.word.toLowerCase() !== word.toLowerCase() || groups.length === 0) {
    return null
  }

  return (
    <div style={{
      marginTop: 8, marginBottom: 2,
      border: '1px solid var(--color-border)', borderRadius: 8,
      background: 'var(--color-surface-sunken)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px 6px 12px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{ ...FIELD_LABEL_STYLE, fontSize: '10.5px' }}>划词例句</span>
        <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
          选择要挂入的释义
        </span>
        <button
          type="button"
          title="关闭，不加入例句"
          aria-label="关闭划词例句"
          onClick={dismiss}
          style={{
            marginLeft: 'auto', width: 22, height: 22, flexShrink: 0, padding: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', color: 'var(--color-text-tertiary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div style={{ padding: '10px 12px 12px' }}>
        {/* 例句用返回页例句行的同一副字形（衬线斜体 14 / 23 + 短破折号），
            让用户看到的就是「加入之后会长成什么样」。 */}
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, lineHeight: '23px', color: 'var(--ink-2)' }}>
          <span style={{ marginRight: 8 }}><DashMark color="var(--ink-3)" /></span>
          {pending.sentence}
        </div>

        <div role="radiogroup" aria-label="例句归入哪个释义" style={{ marginTop: 8, maxHeight: 176, overflowY: 'auto' }}>
          {groups.map(group => group.leaves.map(item => {
            const active = item.key === attachKey
            return (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${group.pos || '该词性'} ${item.label} ${item.value}`}
                onClick={() => setAttachKey(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '5px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.5,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <RadioMark active={active} />
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12.5, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                  {group.pos || '该词性'}
                </span>
                <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{item.label}</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>·</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.value}
                </span>
              </button>
            )
          }))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
          <span style={{
            fontSize: 11.5, lineHeight: 1.45, minWidth: 0,
            color: status === 'failed' ? 'var(--color-danger)'
              : status === 'done' ? 'var(--color-success)'
              : 'var(--color-text-secondary)',
          }}>
            {!inLibrary
              ? STATUS_COPY.noWord
              : status === 'idle' ? '' : STATUS_COPY[status]}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', flexShrink: 0 }}>
            <Button
              onClick={() => { void handleAttach() }}
              disabled={busy || status === 'done' || leaf === null || !inLibrary}
            >
              作为例句加入此释义
            </Button>
          </span>
        </div>
      </div>
    </div>
  )
}
