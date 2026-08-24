import type { DictionaryField } from '../types/dictionary'

export const POS_DISPLAY: Record<string, string> = { n: 'n.', v: 'v.', a: 'adj.', s: 'adj.', r: 'adv.' }

export function posDisplay(code: string): string {
  return POS_DISPLAY[code] || code
}

// WordNet gloss 结尾常带引号例句段（如 '; "a fascinating story"'），语义网络 caption 只需释义主干
export function stripGlossExamples(gloss: string): string {
  return gloss.replace(/\s*;?\s*"[^"]*"/g, '').trim()
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
    const defText = (synset.definition ?? '').trim()
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
