/**
 * 词典首启 gate 的纯函数模型（Android 手机外壳，Task 3）。
 *
 * 首启要把 APK 里的两份词典库复制到 app_data_dir 才能被 sqlite 打开；
 * 在此之前整个应用不能进主界面。这个函数是「此刻该显示什么」的唯一出处，
 * 组件只做渲染，不判断状态。
 *
 * 三分支：ready → 放行；有错误 → 阻塞 + 可重试；其余 → 阻塞 + 准备文案。
 */
import type { DictionaryStatus } from '../services/dictionaryBootstrap'

export interface GateModel {
  /** 是否拦住 children。 */
  blocking: boolean
  /** 未就绪时展示的文案；ready 时为空串。 */
  label: string
  /** 是否显示重试按钮（只有失败态可重试，等待态重试没有意义）。 */
  canRetry: boolean
}

/** 未完成时的准备文案。刻意只有文案、没有百分比——复制是两步、无进度事件。 */
export const PREPARING_LABEL = '正在准备词典…'

export function gateModel(
  status: DictionaryStatus | null,
  error: string | null,
): GateModel {
  if (status?.ready) return { blocking: false, label: '', canRetry: false }
  if (error) return { blocking: true, label: error, canRetry: true }
  return { blocking: true, label: PREPARING_LABEL, canRetry: false }
}
