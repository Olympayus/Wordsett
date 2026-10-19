/**
 * 双向链接语法的**唯一出处**（v0.7.5 任务 1）。
 *
 * 保存时校验、渲染、点击跳转、复习去标记、反链聚合都从这里取判据——解析与校验各写一遍是
 * 「同一段文本在预览里是链接、存盘时却不是」这类分歧的唯一来源。本文件只有纯函数，
 * 不碰 React、不碰数据库。
 *
 * 语法刻意只有两种：`[[目标]]` 指库内词条（library），`{{目标}}` 指词典词（dict）。
 * 目标内不允许再出现 `[` `]` `{` `}`，于是「先匹配到的一半括号」不会被吞进另一个链接里，
 * 残缺标记也能靠一次否定字符类自然落空、退回普通文本。
 */

export type LinkKind = 'library' | 'dict'

export interface LinkSegment {
  kind: 'text' | 'link'
  text: string
  target?: string
  linkKind?: LinkKind
}

export interface LinkToken {
  target: string
  kind: LinkKind
}

export interface LinkError {
  code: 'unclosed' | 'empty-target' | 'not-in-library'
  target?: string
}

/** 两种标记共用一个正则，靠捕获组区分来源；`g` 是为了用 `lastIndex` 顺序切段。 */
const LINK_RE = /\[\[([^[\]{}]*)\]\]|\{\{([^[\]{}]*)\}\}/g

/**
 * 一次扫描切段：匹配到的合法标记之间的原文成为 text 段。
 *
 * 空目标（`''` 或全空白）**不产生 link 段**——`[[]]` 留在普通文本里，由 `validateLinks`
 * 单独报 `empty-target`；这里若也切出一个空链接，渲染层就得再判一次空。
 */
export function parseLinks(text: string): LinkSegment[] {
  const segments: LinkSegment[] = []
  let cursor = 0

  LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LINK_RE.exec(text))) {
    const target = (match[1] ?? match[2]).trim()
    // 空目标当普通文本：不切段、游标不动，这一段自然并进前后 text。
    if (target === '') continue
    if (match.index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.index) })
    segments.push({
      kind: 'link',
      text: target,
      target,
      linkKind: match[1] !== undefined ? 'library' : 'dict',
    })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })

  return segments
}

/** 去标记只留词面：复习判分、搜索索引都按「用户看到的文字」比对，括号本身不是内容。 */
export function stripLinks(text: string): string {
  return parseLinks(text).map(s => s.text).join('')
}

/** 目标按出现顺序逐一返回、**不去重**：反链统计要次数，调用方需要集合时自己去重。 */
export function linkTargets(text: string): LinkToken[] {
  return parseLinks(text)
    .filter((s): s is LinkSegment & { kind: 'link'; target: string; linkKind: LinkKind } => s.kind === 'link')
    .map(s => ({ target: s.target, kind: s.linkKind }))
}

/** 所有比对（校验、反链匹配、统计）共用这一条归一化，避免各写一遍大小写/空格规则。 */
export function normalizeLinkTarget(raw: string): string {
  return raw.trim().toLowerCase()
}

/** 只用于「挖掉所有成对标记」：目标内容是否为空不影响配对与否。 */
const PAIRED_RE = /\[\[[^[\]{}]*\]\]|\{\{[^[\]{}]*\}\}/g

/**
 * 三条判据顺序固定，且可以同时命中（按此顺序排列返回）：
 * ① `unclosed` —— 挖掉所有成对标记后仍残留 `[[` / `{{`（残缺的开头）；
 * ② `empty-target` —— 配对但目标为空或全空白；
 * ③ `not-in-library` —— 只有 library 目标要过库；`{{...}}` 是词典词，词典里没有也合法。
 *
 * `unclosed` 先于其余两条：一个残缺的开头会让后续配对整体错位，用户该先修的是它。
 */
export function validateLinks(text: string, isInLibrary: (lemma: string) => boolean): LinkError[] {
  const errors: LinkError[] = []

  const remainder = text.replace(PAIRED_RE, '')
  if (remainder.includes('[[') || remainder.includes('{{')) errors.push({ code: 'unclosed' })

  LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LINK_RE.exec(text))) {
    if ((match[1] ?? match[2]).trim() === '') errors.push({ code: 'empty-target' })
  }

  for (const token of linkTargets(text)) {
    if (token.kind === 'library' && !isInLibrary(normalizeLinkTarget(token.target))) {
      errors.push({ code: 'not-in-library', target: token.target })
    }
  }

  return errors
}

/**
 * 不可链接的结构字段：这些字段的取值是词条自身的属性（词性、音标……），把它们链到别的词
 * 没有语义。用**排除集**而不是白名单——新增内置内容字段时默认就该可链接，不必回来补表。
 */
const NON_LINKABLE_FIELD_KEYS: ReadonlySet<string> = new Set([
  'part_of_speech',
  'phonetic',
  'word_root',
  'initial_familiarity',
])

export function linkableField(fieldKey: string): boolean {
  return !NON_LINKABLE_FIELD_KEYS.has(fieldKey)
}

/**
 * 把校验结果合成一段弹窗正文（保存时用）：按 code 归并——同一类错误只写一句，
 * `not-in-library` 的多个目标并进同一句、按出现顺序去重（同一个词连写两次不该重复点名）。
 * 标题「链接有误」由调用方的 `confirm` 负责，这里只管正文，避免同一条提示出现两遍标题。
 */
export function linkErrorText(errors: LinkError[]): string {
  const lines: string[] = []

  if (errors.some(e => e.code === 'unclosed')) {
    lines.push('链接标记没有闭合：成对的 [[词条]] 或 {{词典词}} 才算链接，请补上 ]] 或 }}。')
  }
  if (errors.some(e => e.code === 'empty-target')) {
    lines.push('链接目标不能为空：请写成 [[词条]] 或 {{词典词}}。')
  }

  const missing = [...new Set(
    errors
      .filter((e): e is LinkError & { target: string } => e.code === 'not-in-library' && !!e.target)
      .map(e => e.target),
  )]
  if (missing.length > 0) {
    lines.push(`以下目标不在词库中：${missing.join('、')}。链接库内词条请用 [[词条]]，词典词请用 {{词典词}}。`)
  }

  return lines.join('\n')
}
