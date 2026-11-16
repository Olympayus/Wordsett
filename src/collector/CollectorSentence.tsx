import { libraryLocationIn } from '../lib/collected'
import { useWordStore } from '../stores/wordStore'
import { CollectorExisting } from './CollectorExisting'
import { CollectorTitleBar } from './CollectorWord'
import {
  NewSentenceBody,
  SentenceCard,
  TargetRow,
  useDefinitionSelection,
  useSentenceTargets,
} from './sentenceView'
import type { GrabOutcome } from './types'

/**
 * 句子模式的快速收录卡（v0.7.9 spec §5.3 / §5.4）。
 *
 * 三块内容：句子卡 + 目标词行 + 正文（释义树 / 归属 / 底栏）。候选装载、逐目标查词、
 * 勾选与归属已抽到 `sentenceView`（Task 14 的已在库态要复用同一套），本组件只做路由：
 *
 * - 当前目标词**不在库** → `NewSentenceBody`（勾选释义 + 例句子树，收录走
 *   `collectorMergeInputs` → `collectNewWord`）。
 * - 当前目标词**已在库** → 整卡交给 `CollectorExisting`（它保留句子卡 / 目标词行 /
 *   释义树 / 归属，底栏换成「收录例句」；再换目标时它自己重新判定，必要时回到新词流程）。
 *
 * 「整句归入哪个释义」是例句的父级约束：所选叶子在树里强制勾选且不可取消。**每个
 * 目标词各自判定在库状态**——索引订阅对当前词面实时取值，换词即重新解析。
 *
 * 已知代价：目标词在库时本组件已经算过一遍候选与字段（hooks 不能条件调用），
 * `CollectorExisting` 复用传入的字段、不再查词；候选表重算一次（本地 SQLite，代价可忽略）。
 */
export function CollectorSentence({ outcome }: { outcome: GrabOutcome }) {
  const view = useSentenceTargets(outcome)
  const selection = useDefinitionSelection(view.groups, view.allKeys)
  const location = useWordStore(s =>
    view.targetWord ? libraryLocationIn(s.libraryIndex, view.targetWord) : null)

  if (view.targetWord !== null && location !== null) {
    return (
      <CollectorExisting
        key={view.targetWord}
        word={view.targetWord}
        location={location}
        due={null}
        sentence={{ outcome, fields: view.fields }}
      />
    )
  }

  const header = (
    <>
      <SentenceCard text={outcome.text} word={view.targetWord} />
      <TargetRow view={view} />
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <CollectorTitleBar />
      <NewSentenceBody header={header} view={view} selection={selection} outcome={outcome} />
    </div>
  )
}
