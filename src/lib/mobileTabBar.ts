import type { ActiveModule } from '../stores/viewStore'
import type { SessionPhase } from '../stores/reviewSessionStore'
import type { ReviewStrategy } from './review/types'
import { isSessionLive } from './review/sessionGuard'

/**
 * 手机外壳是否隐藏底栏（v0.7.6 复习沉浸态 / v0.7.10 词典详情）。
 *
 * ①「复习模块 + 会话进行中」隐藏：答题时底栏那 62dp 正压在拇指够得着的地方，
 * 而它的五个入口都会打断本轮（`SessionGuard` 会为它们逐个弹确认窗），留着只会挡路、
 * 且让答题页少掉一整条屏幕高度。概览与结算同属复习模块却**不**隐藏——那两态要离开
 * 复习去别处，底栏得在。
 *
 * 会话判据复用 `isSessionLive`，与守卫 / `ReviewModule` 同一处：三处分写时，任一处
 * 收窄都会造出「底栏藏了、会话却不在」这种退不出去的状态。
 *
 * ② `dictOpen`（词典详情打开）时隐藏：详情页底部的 `MobileDictActionBar`（fixed，
 * 86px）会整条盖住底栏，后者只剩一条被压住的色块可看。判据由外壳传入——与详情面板的
 * 渲染条件**同一条表达式**，两处各算则可能一边开着、另一边没跟上。模块无关：工作台 /
 * 储藏库与搜索模块的详情态都会出这条动作条。
 */
export function hideMobileTabBar(
  activeModule: ActiveModule,
  phase: SessionPhase,
  sessionStrategy: ReviewStrategy | null,
  dictOpen: boolean,
): boolean {
  return dictOpen || (activeModule === 'review' && isSessionLive(phase, sessionStrategy))
}
