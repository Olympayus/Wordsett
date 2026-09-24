import type { Template } from './types'

export type { Template }

/** 字段角色分组：一个组 = 一组同义 key，命中任一即视为该组可用。 */
export type FieldGroup = 'translation' | 'definition' | 'example' | 'phonetic'

export const FIELD_KEY_GROUPS: Record<FieldGroup, string[]> = {
  translation: ['chinese_definition'],
  definition: ['english_definition'],
  example: ['example_sentence', 'example'],
  phonetic: ['phonetic'],
}

/** 模板 → 依赖的字段组。声明式：新增题型只需加一条 + 一张 prompt/answer 映射。 */
export const TEMPLATE_DEPS: Record<Template, FieldGroup[]> = {
  recognize: ['translation'],
  cloze: ['example'],
  recall: ['translation'],
  english_def: ['definition'],
  listen: ['phonetic'],
}

/**
 * 出题难度序：从易到难。新词（无日志）按此序兜底，形成「先认后写」的递进。
 * 也是 usableTemplates 的筛选源——**不在此列 = 该题型整体下线**。
 * 听辨 listen：TTS 未落地（`speak` 命令不存在），题面只有播放按钮、无法作答，
 * 唯一的出口「直接跳过」会写 rating = 1 并污染调度数据。故按 spec §4.1「TTS 整体不可用
 * 则该题型下线，其余四题型不受影响」暂时下线；`TEMPLATE_DEPS.listen`、assembleCardDTO 的
 * listen 分支与 PromptCard 的播放按钮都保留，TTS 落地后把它加回本数组即可上线。
 */
export const TEMPLATE_DIFFICULTY: Template[] = ['recognize', 'cloze', 'recall', 'english_def']

export type FieldMask = Record<FieldGroup, boolean>

export interface TemplateLog {
  template: Template
  rating: number
}

const RECENT_N = 10

/** 该模板的近期正确率；无样本返回 null。正确率 = rating ≥ 3（Good/Easy）的占比。 */
export function templateAccuracy(logs: TemplateLog[], template: Template): number | null {
  const recent = logs.filter(l => l.template === template).slice(-RECENT_N)
  if (recent.length === 0) return null
  return recent.filter(l => l.rating >= 3).length / recent.length
}

/** 按字段掩码筛出该词可出的模板，按难度序排列。 */
export function usableTemplates(mask: FieldMask): Template[] {
  return TEMPLATE_DIFFICULTY.filter(t => TEMPLATE_DEPS[t].every(g => mask[g]))
}

/**
 * 最弱题型优先：
 *   1. 未测过的模板优先（探索），按难度序从易到难；
 *   2. 全部测过 → 正确率最低者；
 *   3. 并列时避开上次出过的模板。
 */
export function pickTemplate(
  available: Template[],
  logs: TemplateLog[],
  lastTemplate: Template | null,
): Template | null {
  if (available.length === 0) return null

  const unmeasured = TEMPLATE_DIFFICULTY.filter(
    t => available.includes(t) && templateAccuracy(logs, t) === null,
  )
  if (unmeasured.length > 0) {
    return unmeasured.find(t => t !== lastTemplate) ?? unmeasured[0]
  }

  const scored = available.map(t => ({ t, acc: templateAccuracy(logs, t) as number }))
  const min = Math.min(...scored.map(s => s.acc))
  const tied = scored.filter(s => s.acc === min).map(s => s.t)
  if (tied.length > 1 && lastTemplate) {
    const other = tied.find(t => t !== lastTemplate)
    if (other) return other
  }
  return tied[0]
}
