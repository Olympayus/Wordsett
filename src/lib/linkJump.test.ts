import { describe, it, expect } from 'vitest'
import { resolveJumpTarget } from './linkJump'

const idx = new Map([['forsake', 'workspace'], ['abandon', 'archive']] as const)

describe('resolveJumpTarget', () => {
  it('[[ ]] 目标在工作区 → 去工作区', () => {
    expect(resolveJumpTarget({ target: 'forsake', kind: 'library' }, idx)).toEqual({ to: 'workspace' })
  })
  it('[[ ]] 目标在储藏库 → 去储藏库', () => {
    expect(resolveJumpTarget({ target: 'abandon', kind: 'library' }, idx)).toEqual({ to: 'archive' })
  })
  it('[[ ]] 目标不在库 → null（失效）', () => {
    expect(resolveJumpTarget({ target: 'unknown', kind: 'library' }, idx)).toBeNull()
  })
  it('{{ }} 一律去词典，与在不在库无关', () => {
    expect(resolveJumpTarget({ target: 'forsake', kind: 'dict' }, idx)).toEqual({ to: 'dict' })
    expect(resolveJumpTarget({ target: 'notcollected', kind: 'dict' }, idx)).toEqual({ to: 'dict' })
  })
  it('大小写与空格不影响 [[ ]] 的判定', () => {
    expect(resolveJumpTarget({ target: ' FORSAKE ', kind: 'library' }, idx)).toEqual({ to: 'workspace' })
  })
})
