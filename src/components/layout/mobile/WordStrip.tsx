import type { CSSProperties } from 'react'
import { stripWindow } from '../../../lib/mobileWordStrip'
import { useWordStore } from '../../../stores/wordStore'
import { useViewStore } from '../../../stores/viewStore'

/** 词条条一次画几枚词片（任务书 Step 4 指定 5）。 */
const STRIP_SIZE = 5

/**
 * 词条条（Task 5，spec §4.3 方案 B）：顶栏下常驻一条**当前数据集**内的词，横向滚动换词。
 *
 * 条上只有词片，没有「全部」按钮也没有滚动箭头——抽屉入口在顶栏，横向换词靠滑动本身
 * （spec §4.3）。故本条只是 `words`（已由 `MobileShell` 的模块 ↔ 数据集耦合切成当前模块
 * 的词表）里选中的一段，**不自己取数、不自己分组**。
 *
 * 只画 `STRIP_SIZE` 枚（`stripWindow`）：全画既浪费又让选中片被挤出屏幕。选中片居中，
 * 两端不越界（边界四例由 `mobileWordStrip.test.ts` 钉住）。窗口随选中项**重算**而不做
 * 「尽量少滚动」的偏移补偿：条本来就是横向滚动的，换词后让选中片回到可视区更重要。
 *
 * 选中态走**通用选中配方**（spec §10）：白底 + 1px 描边 + 6px 圆角 + 字重 600，
 * **不是**蓝色胶囊——蓝在本仓只表示选中 / 激活 / 正在编辑这类状态，而这里选中态另有其形。
 * 字体走内联 `--font-sans` 而不是 tailwind 的 `font-sans` 类：本仓的视觉一律内联
 * （见 SquareButton 文件头），那套类名是全站唯一的例外（外壳的 flex 布局），不混用。
 */

/** 词片（选中态与未选中态只差底色 / 描边 / 字重，几何逐字相同——切换时不跳）。 */
const CHIP = {
  height: 30,
  padding: '0 12px',
  borderRadius: 6,
  fontSize: 13,
  lineHeight: 1,
  flexShrink: 0,
} as const

const chipStyle = (on: boolean): CSSProperties => ({
  ...CHIP,
  border: `1px solid ${on ? 'var(--color-border-strong)' : 'transparent'}`,
  background: on ? 'var(--color-surface)' : 'transparent',
  color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
  fontWeight: on ? 600 : 400,
})

export default function WordStrip() {
  const words = useWordStore(s => s.words)
  const selectedWordId = useWordStore(s => s.selectedWordId)
  const selectWord = useWordStore(s => s.selectWord)
  // 正在读词典详情时点词片，要**回到词条页**再看那个词——与 `WordList` 的行点击同一个动作
  // （`selectWord` + `showWorkbenchView`，只切视图、不动模块）。少了这一步，词典页会留在原处：
  // 词片的高亮挪到了新词，正文还是旧的那条，按返回才「跳」到新词，读起来像点错了。
  const showWorkbenchView = useViewStore(s => s.showWorkbenchView)

  const activeIndex = Math.max(0, words.findIndex(w => w.id === selectedWordId))
  const { items } = stripWindow(words, activeIndex, STRIP_SIZE)

  // 空态不出一条空带子：词库为空时整条不渲染（高度塌陷成 0，外壳其余部分逐像素不动）。
  if (words.length === 0) return null

  return (
    <div
      // 不加 `role="list"`：词条条的子项是**真按钮**，套 list/listitem 会把按钮的可及角色
      // 改写成 listitem，读屏报出来的不再是「按钮、可激活」而是「列表项」——控件类型比
      // 容器语义更要紧。容器只留一个可及名（`aria-label` 不依赖 role 也生效）。
      aria-label="词条"
      // 横向滚动：`minWidth: 0` 不可省——flex 子项的缺省 min-width 会让长词把外壳撑宽而不是滚动
      className="shrink-0 flex items-center overflow-x-auto"
      style={{
        gap: 8, padding: '6px 12px', maxWidth: '100%', minWidth: 0,
        // 与顶栏 / 底栏同档面（--color-chrome），三条横带分得开又不抢正文
        background: 'var(--color-chrome)',
        borderBottom: '1px solid var(--color-border)',
        // 触屏横向滑动不该被浏览器的双击缩放 / 点击高亮打断
        touchAction: 'pan-x',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {items.map(w => (
        <button
          key={w.id}
          type="button"
          // 选中片取 `aria-current="page"`——与桌面 `ActivityRail` 的活动模块标记同一口径
          // （`ActivityRail.tsx` 的五枚模块键就是这个写法），不另立一套值。
          aria-current={w.id === selectedWordId ? 'page' : undefined}
          onClick={() => { void selectWord(w.id); showWorkbenchView() }}
          style={{
            ...chipStyle(w.id === selectedWordId),
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {w.lemma}
        </button>
      ))}
    </div>
  )
}
