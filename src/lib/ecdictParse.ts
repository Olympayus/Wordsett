import type { DictionaryField } from '../types/dictionary'

// 词性显示归一化：ecdict 翻译行（中文释义）用带点码（n.），释义行（英文释义）用无点码（n/s/v），
// 同一词性两种写法并存会拆成两个词性父。统一为带点规范形式（与 wordnet POS_DISPLAY 的
// n. / v. / adj. / adv. 一致），使中英释义并入同一词性（搜索页与工作台均合并展示）。
const POS_DISPLAY: Record<string, string> = {
  n: 'n.', v: 'v.', a: 'adj.', adj: 'adj.', s: 'adj.', adv: 'adv.',
  vt: 'vt.', vi: 'vi.', aux: 'aux.', prep: 'prep.', conj: 'conj.',
  pron: 'pron.', abbr: 'abbr.', num: 'num.', art: 'art.', int: 'int.', ad: 'ad.',
}
const normalizePos = (raw: string): string => {
  const code = raw.toLowerCase().replace(/\.$/, '')   // 去尾点后查规范码
  return POS_DISPLAY[code] ?? raw
}

// 词性前缀（ecdict 行首，含点号，保留原样标签）。
// 注意：交替必须「最长前缀优先」——否则 'vi. 跑' 会先匹配 'v'，label 错成 'v'、释义错成 'i. 跑'。
// 含 's'（wordnet 形容词卫星码）：definition 列大量 's ...' 英文释义此前误入 supplementary，现归 adj.（translation 列无 's ' 行，无误匹配风险）。
const POS_RE = /^(vt|vi|adj|adv|aux|prep|conj|pron|abbr|num|art|int|ad|n|v|a|s)\.?/i

// 只按顶层逗号拆（忽略 全角（） 与 半角() 内的逗号）
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '（' || ch === '(') depth++
    else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start))
  return parts.map(s => s.trim()).filter(Boolean)
}

// exchange 前缀 → 中文标注（修正后，spec §5.3）
const EXCHANGE_LABELS: Record<string, string> = {
  p: '过去式', d: '过去分词', i: '现在分词',
  '3': '第三人称单数', s: '复数', f: '复数',
  r: '比较级', t: '最高级', b: '比较级', z: '最高级',
}
// 0(原型)、1(单字母词性码) 为元数据，过滤
const EXCHANGE_SKIP = new Set(['0', '1'])

// translation/definition 字段分隔符：字面反斜杠 n（字符码 92,110）
const SEP = String.fromCharCode(92, 110)

function splitLines(text: string): string[] {
  return text.split(SEP).map(s => s.trim()).filter(Boolean)
}

export function parseExchangeItems(exchange: string): { label: string; value: string }[] {
  if (!exchange) return []
  return exchange.split('/').map(pair => {
    const ci = pair.indexOf(':')
    if (ci === -1) return null
    const prefix = pair.substring(0, ci)
    const value = pair.substring(ci + 1)
    if (EXCHANGE_SKIP.has(prefix)) return null
    return { label: EXCHANGE_LABELS[prefix] || prefix, value }
  }).filter(Boolean) as { label: string; value: string }[]
}

export function buildEcdictFields(input: {
  word: string
  translation: string | null
  definition: string | null
  phonetic?: string | null
  exchange?: string | null
}): DictionaryField[] {
  const fields: DictionaryField[] = []
  if (input.phonetic) fields.push({ key: 'phonetic', value: input.phonetic })

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

  const supplementary: DictionaryField = { key: 'supplementary', value: '', children: [] }
  let supplementaryUsed = false
  const addToSupplementary = (text: string) => {
    supplementaryUsed = true
    supplementary.children!.push({ key: 'supplementary_item', value: text })
  }

  // 中文释义（translation）
  if (input.translation) {
    for (const line of splitLines(input.translation)) {
      if (line.startsWith(`${input.word}的`)) continue // 冗余注释丢弃
      const m = line.match(POS_RE)
      if (m) {
        const rest = line.slice(m[0].length).replace(/^[,，:：\s]+/, '')
        if (rest) {
          const pos = getPos(normalizePos(m[0]))
          for (const part of splitTopLevelCommas(rest)) {
            pos.children!.push({ key: 'chinese_definition', value: part })
          }
        }
      } else {
        addToSupplementary(line)
      }
    }
  }

  // 英文释义（definition），同样带词性前缀
  if (input.definition) {
    for (const line of splitLines(input.definition)) {
      const m = line.match(POS_RE)
      if (!m) { addToSupplementary(line); continue }
      const rest = line.slice(m[0].length).replace(/^[\s:]+/, '')
      if (!rest) continue
      getPos(normalizePos(m[0])).children!.push({ key: 'english_definition', value: rest })
    }
  }

  // 补充释义先于词形变化（模板序：phonetic → POS → supplementary → exchange）
  if (supplementaryUsed) fields.push(supplementary)

  // 词形变化
  if (input.exchange) {
    const items = parseExchangeItems(input.exchange)
    if (items.length) {
      fields.push({
        key: 'exchange', value: '',
        children: items.map(it => ({ key: 'exchange_item', value: `${it.label}: ${it.value}` })),
      })
    }
  }

  return fields
}
