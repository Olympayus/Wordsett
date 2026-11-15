import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirmLeaveEdit, needsConfirmEditLeave } from './editGuard'

/**
 * 退出请求（v0.7.8 Task 8）：托盘菜单「退出」、Cmd+Q 与关窗分流里的「直接退出」
 * 都只 emit `quit-requested`，真正退出由这里统一收口。
 *
 * 为什么要绕这一圈：这些路径原先直接 `app.exit(0)`，会丢掉正在编辑的内容。
 * 现在先过 `confirmLeaveEdit()`——无守卫 / 已干净时立即放行，dirty 时弹确认框；
 * 确认「放弃修改」后才 `invoke('quit_app')`（Rust 侧先置 `QUIT_BYPASS` 再 exit，
 * 避免 `RunEvent::ExitRequested` 把它再拦一次）。取消则应用与编辑态原样保留。
 *
 * **先亮窗再发问（修复轮 1）**：常驻托盘时主窗多半是隐藏的——`CloseAction::Hide`
 * 刻意不确认，脏编辑随窗口一起留下。确认框挂在隐藏窗口里，用户既看不见也点不到，
 * 看起来就像「点了退出没反应」。故只在确实需要确认时 `show()` + `setFocus()`；
 * 干净路径马上退出，不必让窗口闪一下。显示失败（窗口已销毁等）只记日志，不阻断判定。
 *
 * 清理方式与 `useCloseRequest` 相同：`listen` 返回的是 Promise，组件若在监听
 * 注册完成前卸载，cleanup 里的 `.then` 仍能把它注销掉。
 */
export function useQuitRequest(): void {
  useEffect(() => {
    const onQuitRequested = async () => {
      if (needsConfirmEditLeave()) {
        try {
          const win = getCurrentWindow()
          await win.show()
          await win.setFocus()
        } catch (e) {
          console.error('[quit] 显示主窗口失败：', e)
        }
      }
      if (!(await confirmLeaveEdit())) return
      try {
        await invoke('quit_app')
      } catch (e) {
        console.error('[quit] quit_app 失败：', e)
      }
    }
    const unlisten = listen('quit-requested', () => { void onQuitRequested() })
    return () => { void unlisten.then(f => f()) }
  }, [])
}
