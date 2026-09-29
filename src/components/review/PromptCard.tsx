import type { ReviewCardDTO } from '../../services/reviewService'
import { formatPhonetic } from '../../lib/phonetic'
import { promptTypeLabel, posNoteText } from '../../lib/review/scopeLabel'
import SquareButton from '../ui/SquareButton'
import SpeakButton from '../ui/SpeakButton'
import AnswerInput, { type InputKind } from './AnswerInput'

/** 模板 → 作答形态。五个模板已全部显式枚举，default 只作防御。 */
export function inputKindFor(template: ReviewCardDTO['template']): InputKind {
  switch (template) {
    case 'recognize': return 'choice'
    case 'cloze': return 'typed'
    case 'recall': return 'typed'        // spec §4.1：中译英是键入（仅拼写辅助，不判分）
    case 'english_def': return 'typed'   // v0.6.4：由 reveal 改 typed，与中译英同档
    case 'listen': return 'typed'
    default: return 'reveal'
  }
}

/**
 * 逐字母标红的比对目标；仅键入型题目有。
 *
 * **从 inputKindFor 派生**，不再单独维护一张 template 表——先前是「kind 一张表 +
 * template 一张表」两处判据，english_def 一旦加入就会漂，而漂的那一半是「哪些题该标红」。
 *
 * 取不到目标时返回 `undefined` 而不是空串：空串会让逐字母比对把**每个**字符都标红，
 * 用户看到满屏红字、像是题目坏了（Review Focus 1）。AnswerInput 收到 undefined 时不启用标红。
 */
export function typedTarget(dto: ReviewCardDTO): string | undefined {
  if (inputKindFor(dto.template) !== 'typed') return undefined
  const lemma = String(dto.answer.lemma ?? '')
  return lemma === '' ? undefined : lemma
}

/**
 * 是否自动判分。中译英与英文释义题**不判分**——键入仅为拼写辅助，对错由用户自己按三键评。
 *
 * 与 inputKindFor 并排放在这里，是因为 ReviewArena 的 handleSubmit 要按它分支；
 * 先前那里写的是 `dto.template !== 'recall'`，english_def 一加入就会静默开始自动判分，
 * 与本版决策相反。判据收口到这一个函数后，新增自评题型只改这里。
 */
export function autoGrades(template: ReviewCardDTO['template']): boolean {
  return inputKindFor(template) === 'typed' && template !== 'recall' && template !== 'english_def'
}

/**
 * 释义右侧的词性（v0.6.3 条目 3）。衬线斜体 + 次要色——它是释义的注，不是独立信息。
 *
 * 范围限定在**题面区**：结果区的完整词条快照（EntrySnapshot）有自己的词性窗格，
 * 那是词条的原貌，不套用题面的排版规则。
 * `cloze` 不适用——它的词性已由 clozeSentence 放进句子里；`listen` 不显示词性
 * （lemma 不得早渲染，词性会泄露答案）。
 */
function PosNote({ pos }: { pos: string }) {
  const text = posNoteText(pos)
  if (!text) return null
  return (
    <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: '0.86em' }}>
      {text}
    </span>
  )
}

/**
 * 题面行（v0.6.3 条目 18 起**不含**跳过按钮——跳过移到了题面上方的题型行右端，与题型同行。
 * 本组件只负责把题面按统一内边距排出来）。
 */
function PromptRow({ children }: { children: React.ReactNode }) {
  return <div style={{ minWidth: 0 }}>{children}</div>
}

export default function PromptCard({
  dto, letterHighlight, disabled, onSubmit, onSkip, revealedInput,
}: {
  dto: ReviewCardDTO
  letterHighlight: boolean
  disabled: boolean
  onSubmit: (input: string) => void
  /** 「跳过」：直接记「忘了」，不落作答原文（spec §2.4） */
  onSkip: () => void
  /** 回看态：该卡已提交的作答原文，透传给 AnswerInput 复现判分着色 */
  revealedInput?: string
}) {
  const p = dto.prompt as Record<string, any>
  return (
    // 限宽 550 ＝ resultLayout 的 RESULT_HALF_WIDTH（结果区左栏上限），题面与结果区
    // 因此在同一条右边界上结束。**这里写的是字面量而不是导入那个常量**：PromptCard 在
    // 题面渲染之前就要定宽，而 resultLayout 的另一半职责（列定义）只在结果区用；
    // 两处数值必须相等，由「都是 550」这一事实承担，改动时两处一起改。
    <section aria-label="题目" className="flex flex-col gap-4" style={{ maxWidth: '550px' }}>
      {/* 题型行（v0.6.3 条目 18）：左题型、右跳过，同一行。
          跳过从题面块右上角上移到这里——位置几乎没变（只高一行），但题型因此有了固定落点，
          且五种题型共用一套。 */}
      <div className="flex items-center gap-3">
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          {promptTypeLabel(dto.template)}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              marginLeft: 'auto', padding: '4px 12px', borderRadius: '6px',
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text-primary)', fontSize: '12.5px', fontFamily: 'var(--font-sans)', cursor: 'pointer',
            }}
          >跳过</button>
        )}
      </div>
      {dto.template === 'recognize' && (
        <PromptRow>
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 style={{ fontSize: '28px', fontWeight: 600 }}>{p.lemma}</h3>
            <SpeakButton text={String(p.lemma)} size={16} />
            {p.phonetic && (
              <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: 15, color: 'var(--color-text-secondary)' }}>
                {formatPhonetic(String(p.phonetic))}
              </span>
            )}
            <PosNote pos={String(p.partOfSpeech ?? '')} />
          </div>
        </PromptRow>
      )}
      {dto.template === 'cloze' && (
        <PromptRow>
          <p style={{ fontSize: '16px', lineHeight: 1.7 }}>{p.sentence}</p>
          {/* 释义注在题面下方小字（v0.6.2 条目 5）：不再拼进句子里，
              免得挖空旁挂一长串释义把句子读断。为空则不渲染。 */}
          {p.gloss && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
              ____ 在句中意为 {String(p.gloss)}
            </p>
          )}
        </PromptRow>
      )}
      {dto.template === 'recall' && (
        <PromptRow>
          <h3 style={{ fontSize: '22px', fontWeight: 500 }}>
            {p.translation}<PosNote pos={String(p.partOfSpeech ?? '')} />
          </h3>
        </PromptRow>
      )}
      {dto.template === 'english_def' && (
        <PromptRow>
          <p style={{ fontSize: '16px', lineHeight: 1.7 }}>
            {p.definition}<PosNote pos={String(p.partOfSpeech ?? '')} />
          </p>
        </PromptRow>
      )}
      {dto.template === 'listen' && (
        <PromptRow>
          {/* 听辨题面只有播放按钮：lemma 不得早渲染（v0.6 spec §4.1）。
              命令缺失 / 无音色时静默降级，不产生未捕获拒绝（Review Focus #5）。
              tone='surface'：这层与 PromptRow 都不设底，最近一个设了底的祖先是 <main> 的白。 */}
          <SquareButton
            tone="surface"
            onClick={() => {
              void (async () => {
                try {
                  const { invoke } = await import('@tauri-apps/api/core')
                  await invoke('speak', { text: String(dto.answer.lemma ?? ''), rate: 1.0 })
                } catch { /* 静默降级 */ }
              })()
            }}
          >
            播放读音
          </SquareButton>
        </PromptRow>
      )}

      <AnswerInput
        kind={inputKindFor(dto.template)}
        options={Array.isArray(p.options) ? p.options.map((o: unknown) => String(o)) : undefined}
        target={typedTarget(dto) ?? (dto.template === 'recognize' ? String((dto.answer as any).translation ?? '') : undefined)}
        letterHighlight={letterHighlight}
        disabled={disabled}
        onSubmit={onSubmit}
        revealedInput={revealedInput}
      />
    </section>
  )
}
