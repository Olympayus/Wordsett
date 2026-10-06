import type { DictionaryEntry, DictionaryField } from '../types/dictionary'
import type { FieldSource } from '../types/field'
import { mergeEntryFields } from './dictPlan'
import { stripGlossExamples } from './wordnetParse'

// ecdict 行首词性前缀。建字段时 ecdictParse 已经剥过一遍（POS_RE），这里再剥一次是为
// 兜住异形数据——去重宁可多剥一层，不可漏判成「两条」。
// 交替顺序与 ecdictParse.POS_RE 一致（最长前缀优先）：漏了 vt/vi/adv 会让 'a' 抢在 'adj'
// 前面，把英文冠词 A 当词性剥掉，同一句释义两侧判等键就会不一致。
// 冠词 a/an 与单字母词性码 a 同形，故 a/an 只在「后跟句点」时当词性剥（见 POS_ARTICLE_RE）；
// 裸 a 不剥——否则 'a male singer' 与 'N. A male singer' 会算出两个不同的判等键。
const POS_PREFIX_RE = /^(vt|vi|adj|adv|aux|prep|conj|pron|abbr|num|art|int|ad|n|v|s)\.?\s+/i
const POS_ARTICLE_RE = /^(a|an)\.\s+/i

/**
 * 英文释义的判等键。两侧的输入都已是被 parser 处理过的干净 gloss
 * （ecdict 侧词性前缀在建字段时已剥，wordnet 侧引号例句已被 stripGlossExamples 剥掉），
 * 这里只处理残留差异：大小写、标点、括号补充、以及历史数据里没剥干净的前缀/例句段。
 * **不使用模糊匹配**：宁可漏合一两条，也不能把两个不同的意思并成一条。
 */
export function normalizeEnglishDef(v: string): string {
  return stripGlossExamples(v)
    .replace(POS_PREFIX_RE, '')
    .replace(POS_ARTICLE_RE, '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 两源 entries → 一棵合并后的字段树（节点带 source）。
 *
 * 三步：盖来源戳 → mergeEntryFields 按词性合流 → 同词性下逐字重复的英文释义去重。
 * 合流本身不需要新逻辑：两个 parser 的 POS_DISPLAY 早已对齐（见 ecdictParse 的注释），
 * 中性写法（n. / adj.）在两侧是同一串，故按 value 合并父节点就够。
 */
export function mergeSources(entries: DictionaryEntry[]): DictionaryField[] {
  return dedupeEnglishDefs(mergeEntryFields(stampSource(entries)))
}

function stampSource(entries: DictionaryEntry[]): DictionaryField[] {
  const walk = (nodes: DictionaryField[], source: FieldSource): DictionaryField[] =>
    nodes.map(n => ({ ...n, source, ...(n.children ? { children: walk(n.children, source) } : {}) }))
  return entries.flatMap(e => walk(e.fields, e.source))
}

/**
 * 同一词性父的**直属**英文释义里，与 WordNet 行规范化后相等的 ecdict 行丢弃。
 * 只走一层（不递归）：中英释义只挂在词性父下，更深处的同名 key 不属本规则。
 * 保留 WordNet 那条是因为它带 example_sentence / synonyms 子树。
 */
function dedupeEnglishDefs(fields: DictionaryField[]): DictionaryField[] {
  return fields.map(f => {
    if (f.key !== 'part_of_speech' || !f.children) return f
    const wnKeys = new Set<string>()
    for (const c of f.children) {
      if (c.key === 'english_definition' && c.source === 'wordnet') wnKeys.add(normalizeEnglishDef(c.value))
    }
    if (wnKeys.size === 0) return f
    return {
      ...f,
      children: f.children.filter(c =>
        !(c.key === 'english_definition' && c.source === 'ecdict' && wnKeys.has(normalizeEnglishDef(c.value)))
      ),
    }
  })
}
