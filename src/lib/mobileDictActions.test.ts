import { it, expect } from 'vitest'
import { dictActionModel } from './mobileDictActions'

it('未收录：显示熟悉度，可合并', () => {
  expect(dictActionModel(null, 0)).toEqual({ mode: 'add', showFamiliarity: true, canMerge: false, libraryLabel: null })
})
it('已收录：显示归属，勾选后可合并', () => {
  expect(dictActionModel('workspace', 2)).toEqual({ mode: 'collected', showFamiliarity: false, canMerge: true, libraryLabel: '已在工作台' })
})
