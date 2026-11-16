/**
 * 划词小窗的首启就绪判据（v0.7.9）。
 *
 * 主窗完成 `ensureSchema` 后 emit `app-ready`；小窗不抢跑，先等这个事件：
 * - 未就绪且未到 4s：继续等（主窗可能正在建库/迁移）；
 * - 未就绪但已等满 4s：主窗迟迟没发信号，小窗自行连库（多等无益）；
 * - 已就绪且尚未尝试：立刻连库（`retry` = 第一次连接尝试）；
 * - 已就绪且已尝试过仍失败：判失败，不再重试。
 *
 * 纯模块：不得引入 Tauri / SQL 依赖，Node 测试环境可直接加载。
 */
export type DbReadyAction = 'wait' | 'connect' | 'retry' | 'fail'

export function dbReadyAction(s: {
  appReady: boolean
  attempted: boolean
  elapsedMs: number
}): DbReadyAction {
  if (!s.appReady) return s.elapsedMs >= 4000 ? 'connect' : 'wait'
  return s.attempted ? 'fail' : 'retry'
}

/**
 * 两个前端连接都要执行的 pragma：先 busy_timeout，再切 WAL。
 * 顺序固定——WAL 切换可能等锁，先设好 busytimeout 才不会立刻 SQLITE_BUSY。
 */
export function pragmaStatements(): string[] {
  return ['PRAGMA busy_timeout = 5000', 'PRAGMA journal_mode = WAL']
}
