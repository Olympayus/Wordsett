import type { ReactNode } from 'react'

/**
 * 设置页的小节标题（v0.7.3 §4）。
 *
 * 「通用」下有三个小节（外观 / 侧边栏显示 / 托盘与窗口）、「关于」下有两个（数据 / 版本与更新）。
 * 小节标题**只是页内分隔**，不新增导航层级——左栏仍是七个平铺项。
 *
 * **外观与既有的 SECTION_TITLE 逐字一致**：设置页的搜索 / 语音 / 侧边栏 / 数据 / 平台权限
 * 五处小节标题用的就是无衬线 `--text-base` + `--weight-bold` 这一套（如 `DataSettings.tsx:13`）。
 * 这里若用衬线，同一页会出现两种小节标题。
 */
export default function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 style={{
      margin: '0 0 12px', paddingTop: '4px',
      fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)',
      color: 'var(--color-text-primary)',
    }}>{children}</h3>
  )
}
