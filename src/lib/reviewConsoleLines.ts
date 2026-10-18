/**
 * 左栏顶部小控制台（ReviewConsole.tsx）空闲态的四行文案与数字。
 *
 * 纯函数，只拼数据、不碰 DOM——组件只做一件事：`kind === 'num'` 的段套 `.stat-num`、
 * `kind === 'label'` 的段直接印。文案与数字全在这里，测试能逐字钉住每一句
 * （草案第 3 条要的「新词: 5 个　薄弱词: 6 个」那种句子只存在于本文件）。
 *
 * 为什么是四行：到期积压按**卡**、覆盖按**词**、可出按**本轮题数**，三者量纲不同，
 * 并排会被读成分母分子——这是 v0.7.3 Task 4 把它们拆开的原因；本任务只是把「覆盖」
 * 从第 1 行也拆下来，并把两个**同源**的词数（新词与薄弱词，都是「这一轮里各有多少」）
 * 并成一句。第 4 行刻意不写成「其中新词 n 个 · 薄弱词 n 个」那种带主从的形状——
 * 两者是同源并列，谁也不是谁的从属。
 */

export type ConsoleSeg = { kind: 'label' | 'num'; text: string }
export type ConsoleLine = ConsoleSeg[]

export function consoleLines(
  o: { total: number; dueWordCount: number; deliverable: number; newCount: number },
  weakCount: number,
): ConsoleLine[] {
  return [
    [
      { kind: 'label', text: '待复习 ' },
      { kind: 'num', text: String(o.total) },
      { kind: 'label', text: ' 张' },
    ],
    [
      { kind: 'label', text: '覆盖 ' },
      { kind: 'num', text: String(o.dueWordCount) },
      { kind: 'label', text: ' 个词' },
    ],
    [
      { kind: 'label', text: '本轮可出 ' },
      { kind: 'num', text: String(o.deliverable) },
      { kind: 'label', text: ' 道' },
    ],
    [
      { kind: 'label', text: '新词: ' },
      { kind: 'num', text: String(o.newCount) },
      { kind: 'label', text: ' 个　薄弱词: ' },
      { kind: 'num', text: String(weakCount) },
      { kind: 'label', text: ' 个' },
    ],
  ]
}
