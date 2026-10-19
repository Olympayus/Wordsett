import { describe, it, expect } from 'vitest'
import { moveTarget, moveActionLabel, moveConfirmRequest, moveBatchConfirmRequest } from './archiveMove'

// v0.7.5 Task 11：三处入口（行右键菜单 / 批量条 / 导航条）共用的动作文案与确认框请求体。
// 文案逐字钉住——任务书要求三处入口说同一句话，复制粘贴两遍迟早会漂。
describe('archiveMove（v0.7.5 Task 11：移入 / 移回入口共用文案）', () => {
  it('moveTarget：工作台去储藏库，储藏库回工作台', () => {
    expect(moveTarget('workspace')).toBe('archive')
    expect(moveTarget('archive')).toBe('workspace')
  })

  it('moveActionLabel 跟随当前模块', () => {
    expect(moveActionLabel('workspace')).toBe('移入储藏库')
    expect(moveActionLabel('archive')).toBe('移回工作台')
  })

  it('单条确认框：移入解释它离开词表与复习、可从储藏库找回', () => {
    expect(moveConfirmRequest('archive', 'abandon')).toEqual({
      title: '移入储藏库',
      message: '“abandon”将从工作台移入储藏库：不再出现在工作台词表，也不参与复习。可从左侧储藏库找回。',
    })
  })

  it('单条确认框：移回解释它重新参与复习', () => {
    expect(moveConfirmRequest('workspace', 'forsake')).toEqual({
      title: '移回工作台',
      message: '“forsake”将从储藏库移回工作台，并重新参与复习。',
    })
  })

  it('批量确认框：同一套解释，主语换成「选中的 N 个单词」', () => {
    expect(moveBatchConfirmRequest('archive', 3)).toEqual({
      title: '移入储藏库',
      message: '选中的 3 个单词将从工作台移入储藏库：不再出现在工作台词表，也不参与复习。可从左侧储藏库找回。',
    })
    expect(moveBatchConfirmRequest('workspace', 2)).toEqual({
      title: '移回工作台',
      message: '选中的 2 个单词将从储藏库移回工作台，并重新参与复习。',
    })
  })
})
