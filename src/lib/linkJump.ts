import { useCallback } from 'react'
import { normalizeLinkTarget, type LinkToken } from './links'
import { useViewStore } from '../stores/viewStore'
import { useWordStore } from '../stores/wordStore'
import { useUiStore } from '../stores/uiStore'
import type { WordLocation } from '../types/word'
import type { DictionaryField } from '../types/dictionary'

/**
 * 链接点击的去向（v0.7.5 任务 4）。
 *
 * 与 `lib/links.ts` 同一分工：解析 / 校验 / 归一化在那边，这边只回答「点了去哪」。
 * `resolveJumpTarget` 刻意是**纯函数**——三种去向的判定（工作区 / 储藏库 / 词典 / 失效）
 * 不依赖 store、可单测；`useLinkJump` 只把判定结果落到实际的导航与提示上。
 *
 * 为什么 `{ to: 'archive' }` 在类型里、本任务却不实现：`ActiveModule` 与
 * `useWordStore.setLocation` 都要到 Task 9 才存在，且当前索引只含工作区、该分支不可达。
 * 届时把 `TODO(Task 9)` 换成 `showModule('archive')` + `setLocation('archive')` 即可。
 */

export type JumpTarget = { to: WordLocation } | { to: 'dict' }

/**
 * `[[ ]]` 查库内索引（键已是 `normalizeLinkTarget(lemma)`）；`{{ }}` 一律去词典，
 * 与在不在库无关——词典是兜底，没收录也不影响「该去词典」这个判定（点击时才查）。
 * 返回 `null` 表示 `[[ ]]` 目标不在库（失效链接）。
 */
export function resolveJumpTarget(
  token: LinkToken,
  index: Map<string, WordLocation>,
): JumpTarget | null {
  if (token.kind === 'dict') return { to: 'dict' }
  const location = index.get(normalizeLinkTarget(token.target))
  return location ? { to: location } : null
}

/** 失效链接的统一提示（「索引说有、当前词表里没有」与「索引里没有」同一句话）。 */
async function alertMissing(target: string): Promise<void> {
  await useUiStore.getState().confirm({
    alertMode: true,
    title: '该词已不在库中',
    message: `链接目标“${target}”已不在词库中，可能已被删除。`,
  })
}

/**
 * 点击链接时的跳转实现（v0.7.5 任务 4）。
 *
 * 返回的函数是**稳定引用**（空依赖 `useCallback`）：store 一律在调用时用 `getState()` 读，
 * 而不是在渲染期订阅——点击是一次性动作，不需要为词表 / 索引的变化重渲染调用方。
 *
 * 顺序对 `workspace` 是硬要求：先切模块、再选中词条。反过来的话 `selectWord` 会在
 * 旧数据集里找目标（Task 9 引入储藏库后尤其明显）。
 */
export function useLinkJump(): (token: LinkToken) => Promise<void> {
  return useCallback(async (token: LinkToken): Promise<void> => {
    const { libraryIndex, words, selectWord } = useWordStore.getState()
    const resolved = resolveJumpTarget(token, libraryIndex)
    const lemma = normalizeLinkTarget(token.target)

    // `[[ ]]` 失效：索引里查不到。`LinkedText` 在渲染期已把这种链接画成删除线，
    // 点击不再尝试导航——没有一条「去哪」是安全的。
    if (!resolved) {
      await alertMissing(token.target)
      return
    }

    if (resolved.to === 'dict') {
      // 词典服务按需加载：它在模块加载时就经 `providers/dictPath` 向 Tauri 要词典库路径
      // （node 测试环境没有 `window`，会留下未处理的 rejection）。本文件的 `resolveJumpTarget`
      // 是纯函数、需要在 node 里单独导入；仓内 `theme.ts` / `reviewService.ts` 有同样的按需加载写法。
      //
      // 查询失败与「查无此词」是两件事：前者是环境 / IO 错误（词典库缺失、权限、Tauri invoke 失败），
      // 必须提示「查询失败」而不是误报「未收录」。两条路径都**不导航**，页面原地不动。
      let entries: DictionaryField[] | null
      try {
        const { lookupWord } = await import('../services/searchService')
        entries = await lookupWord(lemma)
      } catch {
        await useUiStore.getState().confirm({
          alertMode: true,
          title: '词典查询失败',
          message: `查询词典时出错，暂时无法打开“${lemma}”。请稍后重试。`,
        })
        return
      }
      // 先查词典再切视图：词典没收录时页面必须原地不动，否则用户会落到一个
      // 「未找到」的词典页，而提示又叠在上面。
      if (entries.length === 0) {
        await useUiStore.getState().confirm({
          alertMode: true,
          title: '词典中未收录该词',
          message: `词典中没有找到“${lemma}”，请检查拼写，或改用 [[词条]] 链接库内词条。`,
        })
        return
      }
      // 三处同用归一化词面：查的是它、提示里写的是它、词典页拿到的也是它。
      useViewStore.getState().showDict(lemma)
      return
    }

    if (resolved.to === 'archive') {
      // TODO(Task 9): 储藏库模块与 `setLocation('archive')` 落地后接上：
      // showModule('archive') → setLocation('archive') → selectWord(id)。
      // 本任务不调用 showModule('archive')——该值还不在 `ActiveModule` 里。
      return
    }

    // 索引说在工作区，但当前已加载的词表里找不到它（理论上不会发生：两者同源，
    // 除非两次 loadWords 之间词条被删）。宁可提示，也不要带着 `undefined` 去 selectWord。
    const word = words.find(w => normalizeLinkTarget(w.lemma) === lemma)
    if (!word) {
      await alertMissing(token.target)
      return
    }

    useViewStore.getState().showModule('workbench')
    // 默认 `record: true`：链接跳转与列表选词一样进历史栈，导航条左箭头能回来。
    await selectWord(word.id)
  }, [])
}
