import { it, expect } from 'vitest'
import { backAction } from './mobileBackStack'

it('按优先级逐层关闭', () => {
  expect(backAction(['sheet', 'drawer'])).toEqual({ type: 'closeSheet' })
  expect(backAction(['edit', 'drawer'])).toEqual({ type: 'cancelEdit' })
  expect(backAction(['drawer'])).toEqual({ type: 'closeDrawer' })
  expect(backAction(['dict', 'search'])).toEqual({ type: 'closeDict' })
  expect(backAction(['search'])).toEqual({ type: 'closeSearch' })
})
it('没有层时退出', () => expect(backAction([])).toEqual({ type: 'exit' }))
