import { useCallback, useEffect, useMemo, useState } from 'react'
import RadioMark from '../ui/RadioMark'
import Icon from '../icons'
import { DashMark } from '../entry/Mark'
import { FIELD_LABEL_STYLE } from '../../lib/labelStyle'
import {
  collectorMergeInputs,
  definitionGroups,
  type DefinitionLeaf,
} from '../../lib/collectorTree'
import { ensureWord } from '../../lib/ensureWord'
import { appendExampleUnderDefinition } from '../../services/wordService'
import { usePendingExampleStore } from '../../stores/pendingExampleStore'
import { useWordStore } from '../../stores/wordStore'
import type { DictionaryField } from '../../types/dictionary'

/**
 * 词典详情页的「划词例句」条（v0.7.9）。
 *
 * 句子模式下小窗点「打开详情页」时，Rust 的 `open-dict` 事件带着整句原文一起来；
 * `App` 把它存进 `pendingExampleStore`，本组件在详情页顶部出一条横幅：句子 + 释义选项 +
 * 「不添加」，让这句话也能在详情页挂到某条释义下（与小窗内的能力对齐）。
 *
 * 交互（用户裁定）：**唯一的动作按钮是右上角的「添加」**。选项列表只有释义单选与
 * 「不添加」两项，默认停在「不添加」——没选释义时「添加」不可点；右上角的 × 关闭
 * 同样表示不添加。挂入之后「添加」变为「已加入」，随即整条收起。
 *
 * 写入顺序与「父级必须存在」的约束：
 * 1. `ensureWord`：词条不存在就先建（与搜索结果页的收录同一条路径）；
 * 2. `collectorMergeInputs` 只带所选那一枚释义（含祖先词性）走 `mergeWordFields`——
 *    merge 按「父作用域 + 字段 + 值」去重，既有释义是幂等的，缺的释义则补上；
 * 3. `appendExampleUnderDefinition` 按 `(字段, 值)` 找到那条释义行，把
 *    `example_sentence > example` 挂到它下面（同一例句重复挂是幂等的）。
 *
 * 不碰熟悉度：这不是一次「收录」，只是给既有释义补一条例句；新词的熟悉度走默认档，
 * 与收录流程在同一处写（`setInitialFamiliarity`），这里不越权。
 */

export default function GrabbedSentenceBar({ word, fields }: {
  word: string
  fields: DictionaryField[]
}) {
  const pending = usePendingExampleStore(s => s.pending)
  const groups = useMemo(() => definitionGroups(fields).filter(g => g.leaves.length > 0), [fields])
  /** 当前选择：`null` = 不添加（默认）。 */
  const [attachKey, setAttachKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState(false)

  // 换词 / 换一次抓取：选择与状态都重新开始（本组件常驻在详情页里，word 会变）。
  useEffect(() => {
    setAttachKey(null)
    setError(false)
    setDone(false)
  }, [word, groups])

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
    setError(false)
    try {
      const target = await ensureWord(word)
      if (!target) {
        setError(true)
        return
      }
      // 先保证父级释义在库里（新建词 / 该释义尚未合并过）：merge 幂等，既有释义不会重复。
      const inputs = collectorMergeInputs(fields, new Set([leaf.key]))
      if (inputs.length > 0) {
        const merged = await useWordStore.getState().mergeWordFields(target.id, inputs)
        if (!merged) {
          setError(true)
          return
        }
      }
      const attached = await appendExampleUnderDefinition(
        target.id,
        {
          key: leaf.label === '中文释义' ? 'chinese_definition' : 'english_definition',
          value: leaf.value,
        },
        pending.sentence,
      )
      if (!attached) {
        setError(true)
        return
      }
      // 词表 / 索引刷新：词条卡片与工作区要能看到这条例句（同一 webview，直接走 store）。
      await useWordStore.getState().loadWords().catch(() => {})
      setDone(true)
      // 让「已加入」停留一瞬再收起：立刻卸载会让用户看不到刚才那一下发生了什么。
      setTimeout(() => usePendingExampleStore.getState().clear(), 1100)
    } finally {
      setBusy(false)
    }
  }, [pending, leaf, busy, word, fields])

  // 只在「带句子的抓取」打开的那个词上出现；fields 没到时先不出（组还没算）。
  if (!pending || pending.word.toLowerCase() !== word.toLowerCase() || groups.length === 0) {
    return null
  }

  const addDisabled = busy || done || leaf === null
  const addLabel = done ? '已加入' : busy ? '加入中…' : '添加'

  return (
    <div style={{
      marginTop: 8, marginBottom: 2,
      border: '1px solid var(--color-border)', borderRadius: 8,
      background: 'var(--color-surface-sunken)', overflow: 'hidden',
    }}>
      {/* 头：左标题；右上角是**唯一的动作**（添加）与关闭（同样表示不添加）。 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px 6px 12px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={FIELD_LABEL_STYLE}>划词例句</span>
        <button
          type="button"
          onClick={() => { void handleAttach() }}
          disabled={addDisabled}
          style={{
            marginLeft: 'auto', padding: '3px 10px', flexShrink: 0,
            border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, lineHeight: '18px',
            cursor: addDisabled ? 'default' : 'pointer',
            color: done
              ? 'var(--color-success)'
              : addDisabled ? 'var(--color-text-tertiary)' : 'var(--color-brand)',
          }}
          onMouseEnter={e => { if (!addDisabled) e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {addLabel}
        </button>
        <button
          type="button"
          title="关闭，不加入例句"
          aria-label="关闭划词例句"
          onClick={dismiss}
          style={{
            width: 22, height: 22, flexShrink: 0, padding: 0,
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

      <div style={{ padding: '10px 12px 10px' }}>
        {/* 例句用返回页例句行的同一副字形（衬线斜体 14 / 23 + 短破折号），
            让用户看到的就是「加入之后会长成什么样」。 */}
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, lineHeight: '23px', color: 'var(--ink-2)' }}>
          <span style={{ marginRight: 8 }}><DashMark color="var(--ink-3)" /></span>
          {pending.sentence}
        </div>

        <div role="radiogroup" aria-label="例句归入哪个释义" style={{ marginTop: 6, maxHeight: 176, overflowY: 'auto' }}>
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
          {/* 「不添加」是列表里的正式选项（默认选中）：它让「什么都不做」也是一个明确的
              选择，而不是只能靠右上角的 × 猜。 */}
          <button
            type="button"
            role="radio"
            aria-checked={attachKey === null}
            aria-label="不添加"
            onClick={() => setAttachKey(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '5px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'transparent', cursor: 'pointer', textAlign: 'left',
              color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.5,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <RadioMark active={attachKey === null} />
            <span>不添加</span>
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--color-danger)' }}>
            加入例句失败，请重试
          </div>
        )}
      </div>
    </div>
  )
}
