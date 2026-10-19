import type { WordLocation } from '../types'

/**
 * 移入 / 移回（v0.7.5 Task 11）的共用文案与目标判定。
 *
 * 三处入口（侧栏行右键菜单、批量条、工作台导航条）说的是同一件事，任务书要求
 * 三处共用一份确认框文案。文案与判定放在这里、由调用点各自弹确认（store 只执行移动），
 * 复制粘贴两遍的副本迟早会漂。
 */
export function moveTarget(from: WordLocation): WordLocation {
  return from === 'archive' ? 'workspace' : 'archive'
}

/** 当前模块里那个动作按钮 / 菜单项该叫什么。 */
export function moveActionLabel(from: WordLocation): '移入储藏库' | '移回工作台' {
  return from === 'archive' ? '移回工作台' : '移入储藏库'
}

/** 单个词的确认框请求体（`useUiStore.confirm` 的入参，非 alert）。 */
export function moveConfirmRequest(to: WordLocation, lemma: string): { title: string; message: string } {
  return {
    title: to === 'archive' ? '移入储藏库' : '移回工作台',
    message: to === 'archive'
      ? `“${lemma}”将从工作台移入储藏库：不再出现在工作台词表，也不参与复习。可从左侧储藏库找回。`
      : `“${lemma}”将从储藏库移回工作台，并重新参与复习。`,
  }
}

/** 批量条的确认框请求体：同一套解释，主语换成「选中的 N 个单词」。 */
export function moveBatchConfirmRequest(to: WordLocation, count: number): { title: string; message: string } {
  return {
    title: to === 'archive' ? '移入储藏库' : '移回工作台',
    message: to === 'archive'
      ? `选中的 ${count} 个单词将从工作台移入储藏库：不再出现在工作台词表，也不参与复习。可从左侧储藏库找回。`
      : `选中的 ${count} 个单词将从储藏库移回工作台，并重新参与复习。`,
  }
}
