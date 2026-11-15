import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// 源码级守卫（沿用本仓既有做法，如 WordList.test.ts / WordWorkbench.test.ts）：
// 仓库没有组件测试 harness（vitest 只收 *.test.ts、environment: node），而本 hook 的
// 回归点正是**调用顺序**——脏编辑 + 主窗隐藏在托盘时，必须先亮窗再弹确认；否则确认框
// 挂在隐藏窗口里，用户点「退出」看起来毫无反应（v0.7.8 Task 8 修复轮 1）。
const src = readFileSync(new URL('./useQuitRequest.ts', import.meta.url), 'utf8')
// 运行时前提：`win.show()` / `win.setFocus()` 都是 ACL 门控的 JS API，权限不在
// capabilities 里就会 reject——而上面的 try/catch 会把它吞成一条日志，窗口仍不亮。
// 该能力表只作用于 main 窗口，`quit-requested` 在手机端从不触发。
const capabilities = JSON.parse(
  readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8'),
) as { permissions: string[] }

describe('useQuitRequest 退出前的窗口唤醒（源码级守卫）', () => {
  it('只在需要确认时亮窗，show / setFocus 包在 try/catch 里（失败不阻断退出判定）', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bneedsConfirmEditLeave\b[^}]*\}\s*from\s*'\.\/editGuard'/,
    )
    expect(src).toMatch(
      /if \(needsConfirmEditLeave\(\)\) \{\s*try \{[\s\S]*?await win\.show\(\)[\s\S]*?await win\.setFocus\(\)[\s\S]*?\} catch \(e\) \{/,
    )
  })

  it('亮窗发生在弹确认之前', () => {
    const guard = src.indexOf('if (needsConfirmEditLeave())')
    const show = src.indexOf('await win.show()')
    const focus = src.indexOf('await win.setFocus()')
    const confirm = src.indexOf('await confirmLeaveEdit()')
    expect(guard).toBeGreaterThan(-1)
    expect(show).toBeGreaterThan(guard)
    expect(focus).toBeGreaterThan(show)
    expect(confirm).toBeGreaterThan(focus)
  })

  it('确认放行后才调用 quit_app：拒绝路径直接 return，invoke 只在放行之后', () => {
    // 不只比字符串先后：钉住守卫的 return 形状，取消时不可能落到 invoke。
    expect(src).toMatch(/if \(!\(await confirmLeaveEdit\(\)\)\) return/)
    const guard = src.indexOf('if (!(await confirmLeaveEdit())) return')
    const quit = src.indexOf("await invoke('quit_app')")
    expect(guard).toBeGreaterThan(-1)
    expect(quit).toBeGreaterThan(guard)
  })

  it('capability 授予 window show / set-focus（否则运行时拒绝被 try/catch 吞掉）', () => {
    expect(capabilities.permissions).toContain('core:window:allow-show')
    expect(capabilities.permissions).toContain('core:window:allow-set-focus')
  })
})
