import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '../components/ui/Button'
import SpeakButton from '../components/ui/SpeakButton'
import { collectedLabel, libraryLocationIn } from '../lib/collected'
import { dueLine, type WordDueStatus } from '../lib/dueLine'
import { getWordDueStatus } from '../services/wordDue'
import { useWordStore } from '../stores/wordStore'
import type { DictionaryField } from '../types/dictionary'
import type { WordLocation } from '../types/word'
import { BottomBar, CollectorTitleBar, WORD_HEAD_STYLE } from './CollectorWord'
import {
  ExistingSentenceBody,
  NewSentenceBody,
  SentenceCard,
  TargetRow,
  useDefinitionSelection,
  useSentenceTargets,
} from './sentenceView'
import type { GrabOutcome } from './types'

/**
 * 「已在库」态（v0.7.9 spec §5.3 的「已在库态」）。
 *
 * 归属文字取 `collectedLabel(location)`（`--color-accent`，无胶囊底色）、一行复习
 * 调度状态（`dueLine`）、一行说明；**单词模式不提供收录**，底栏只有「打开详情页」。
 *
 * 句子模式保留句子卡、目标词行、释义树与「整句归入哪个释义」，底栏是
 * 「打开详情页 + 收录例句」——只写例句、不写词性 / 释义。目标词可以换，每个目标词
 * 各有自己的在库状态：切到**不在库**的目标时，正文回到与新词相同的一条流程
 * （`NewSentenceBody`，`collectorMergeInputs` → `collectNewWord`）。
 */

export interface CollectorExistingProps {
  word: string
  location: WordLocation
  /** 调度状态由调用方查好传入；尚未取回时传 null（该行显示占位、不闪「尚无复习计划」）。 */
  due: WordDueStatus | null
  /** 句子模式的整句与当前目标词的字段树；单词模式不传。 */
  sentence?: { outcome: GrabOutcome; fields: DictionaryField[] }
}

const NOTE_STYLE = {
  fontSize: '12.5px', lineHeight: 1.6, color: 'var(--color-text-secondary)',
}

const DUE_STYLE = {
  fontSize: '12.5px', lineHeight: 1.5, color: 'var(--color-text-secondary)',
  fontVariantNumeric: 'tabular-nums' as const,
}

/** 头行（词 + 喇叭 + 归属）+ 调度行 + 说明。单词 / 句子两种形态共用。 */
function ExistingStatus({ word, location, due }: {
  word: string
  location: WordLocation
  due: WordDueStatus | null
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <span style={WORD_HEAD_STYLE}>{word}</span>
        <span style={{ alignSelf: 'center', display: 'inline-flex' }}>
          <SpeakButton text={word} size={16} />
        </span>
        <span style={{
          alignSelf: 'center', marginLeft: 'auto',
          fontSize: '12.5px', fontWeight: 600, color: 'var(--color-accent)',
        }}>
          {collectedLabel(location)}
        </span>
      </div>
      <div style={DUE_STYLE}>{due ? dueLine(due) : '正在读取复习状态…'}</div>
      <div style={NOTE_STYLE}>这个词已在词库中，本次不重复收录。</div>
    </>
  )
}

function WordExisting({ word, location, due }: { word: string; location: WordLocation; due: WordDueStatus | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <CollectorTitleBar />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px 14px' }}>
        <ExistingStatus word={word} location={location} due={due} />
      </div>
      <BottomBar>
        <Button
          variant="secondary"
          onClick={() => {
            void invoke('collector_open_dict', { word }).catch(e => console.error('[collector] 打开详情页失败', e))
          }}
        >
          打开详情页
        </Button>
      </BottomBar>
    </div>
  )
}

/**
 * 当前目标词的调度状态：初始目标直接用调用方传入的 `due`（Root 已查），换目标后
 * 按新词面重查。`initialDue` 为 null 时（句子模式的父级不预查）对初始目标也查一次。
 */
function useTargetDue(
  word: string | null,
  location: WordLocation | null,
  initialWord: string,
  initialDue: WordDueStatus | null,
): WordDueStatus | null {
  // 状态连同词面一起存：换目标后的第一帧不把上一个词的调度行拿给新词看。
  const [state, setState] = useState<{ word: string; status: WordDueStatus } | null>(() =>
    initialDue !== null ? { word: initialWord, status: initialDue } : null)
  useEffect(() => {
    if (!word || location === null) return
    if (word === initialWord && initialDue !== null) {
      setState({ word: initialWord, status: initialDue })
      return
    }
    let cancelled = false
    void getWordDueStatus(word, location)
      .then(status => { if (!cancelled) setState({ word, status }) })
      .catch(e => { console.error('[collector] 复习状态查询失败', e) })
    return () => { cancelled = true }
  }, [word, location, initialWord, initialDue])

  if (state !== null && state.word === word) return state.status
  // 初始目标的父级 due 还没取回时先显示占位；其它目标在查到之前同样显示占位。
  return word === initialWord ? initialDue : null
}

function SentenceExisting({ word, location, due, sentence }: {
  word: string
  location: WordLocation
  due: WordDueStatus | null
  sentence: { outcome: GrabOutcome; fields: DictionaryField[] }
}) {
  // 初始目标与字段由调用方直接传入：不重复查词；换目标后的词各查各的。
  const view = useSentenceTargets(sentence.outcome, { target: word, fields: sentence.fields })
  const selection = useDefinitionSelection(view.groups, view.allKeys)
  // 每个目标词各有自己的在库状态——换词必须重新判一次，而不是沿用挂载时的结论。
  const storeLocation = useWordStore(s =>
    view.targetWord ? libraryLocationIn(s.libraryIndex, view.targetWord) : null)
  const targetLocation = storeLocation ?? (view.targetWord === word ? location : null)
  const targetDue = useTargetDue(view.targetWord, targetLocation, word, due)

  const header = (
    <>
      <SentenceCard text={sentence.outcome.text} word={view.targetWord} />
      <TargetRow view={view} />
      {targetLocation !== null && (
        <ExistingStatus word={view.targetWord ?? word} location={targetLocation} due={targetDue} />
      )}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <CollectorTitleBar />
      {targetLocation === null ? (
        // 目标词已换成不在库的词：回到正常句子收录流程（只写这一条新词）。
        <NewSentenceBody header={header} view={view} selection={selection} outcome={sentence.outcome} />
      ) : (
        <ExistingSentenceBody header={header} view={view} selection={selection} outcome={sentence.outcome} />
      )}
    </div>
  )
}

export function CollectorExisting({ word, location, due, sentence }: CollectorExistingProps) {
  if (!sentence) return <WordExisting word={word} location={location} due={due} />
  return <SentenceExisting word={word} location={location} due={due} sentence={sentence} />
}
