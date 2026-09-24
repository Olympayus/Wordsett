import type { DictionaryField } from '../types/dictionary'

export const POS_DISPLAY: Record<string, string> = { n: 'n.', v: 'v.', a: 'adj.', s: 'adj.', r: 'adv.' }

export function posDisplay(code: string): string {
  return POS_DISPLAY[code] || code
}

// WordNet gloss 结尾常带引号例句段（如 '; "a fascinating story"'），语义网络 caption 只需释义主干
export function stripGlossExamples(gloss: string): string {
  return gloss.replace(/\s*;?\s*"[^"]*"/g, '').trim()
}

export interface GlossParts {
  definition: string
  examples: string[]
}

// 引号感知分段：分号只在双引号外才是分隔符，例句正文内的分号属字面内容。
// 真实 wordnet.db 中约 8.4% 的 gloss 在引号内含分号；且释义本身可能是多段未加引号的正文，
// 朴素按 ';' 切分会把这些释义段误判为例句、并把含分号的引号例句打碎，故必须引号感知。
// definition 为全部非引号段按原序以 '; ' 拼接；examples 保留例句自带的双引号。
export function splitGlossParts(gloss: string): GlossParts {
  const segments: string[] = []
  let buf = ''
  let inQuote = false
  for (const ch of gloss) {
    if (ch === '"') {
      inQuote = !inQuote
      buf += ch
    } else if (ch === ';' && !inQuote) {
      segments.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  segments.push(buf)

  const definitions: string[] = []
  const examples: string[] = []
  for (const raw of segments) {
    const seg = raw.trim()
    if (!seg) continue // 空段 / 尾随分号产生的空段
    if (seg.length >= 2 && seg.startsWith('"') && seg.endsWith('"')) {
      if (seg.length > 2) examples.push(seg) // 退化空引号 `""` 无正文，直接丢弃
    } else {
      definitions.push(seg)
    }
  }
  return { definition: definitions.join('; '), examples }
}

export interface SynsetInput {
  pos: string
  definition: string
  examples?: string | null
  words?: string | null
}

export function buildWordnetFields(word: string, synsets: SynsetInput[]): DictionaryField[] {
  const fields: DictionaryField[] = []
  const posParents = new Map<string, DictionaryField>()
  const getPos = (label: string): DictionaryField => {
    let p = posParents.get(label)
    if (!p) {
      p = { key: 'part_of_speech', value: label, children: [] }
      posParents.set(label, p)
      fields.push(p)
    }
    return p
  }

  for (const synset of synsets) {
    // definition 列内嵌的引号例句段剥离（例句只由 examples 列承载为 example_sentence）
    const defText = stripGlossExamples((synset.definition ?? '').trim())
    const wordsList = synset.words
      ? synset.words.split('\n').map(w => w.trim()).filter(w => w && w.toLowerCase() !== word.toLowerCase())
      : []
    const examples = synset.examples ? synset.examples.split('\n').filter(Boolean) : []

    // 近义词/例句按释义归组：挂在对应 english_definition 下（schema 约定释义下才允许例句/近义词）。
    // 这样入库后 sortTreeByTemplate 按 DEFINITION_CHILD_RANK 保持每个释义各自的例句/近义词，不被打散。
    const defChildren: DictionaryField[] = []
    if (examples.length) {
      defChildren.push({ key: 'example_sentence', value: '', children: examples.map(ex => ({ key: 'example', value: ex })) })
    }
    if (wordsList.length) {
      defChildren.push({ key: 'synonyms', value: '', children: wordsList.map(w => ({ key: 'synonym_item', value: w })) })
    }

    if (defText) {
      getPos(posDisplay(synset.pos)).children!.push(
        defChildren.length
          ? { key: 'english_definition', value: defText, children: defChildren }
          : { key: 'english_definition', value: defText }
      )
    } else if (defChildren.length) {
      // 兜底：无释义但带近义词/例句时直接挂词性下，避免节点游离
      getPos(posDisplay(synset.pos)).children!.push(...defChildren)
    }
  }
  return fields
}
