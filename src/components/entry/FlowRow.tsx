import type { ReactNode } from 'react'
import { SourceBar } from './SourceMark'
import type { FieldState } from '../../lib/fieldState'

/**
 * 正文流的一行（v0.7.2）。三个槽：左缘来源条 / 编号槽 / 正文 + 行尾槽。
 *
 * 编号槽固定 18px 右对齐，正文因此是**悬挂缩进**——折行后第二行与第一行左缘对齐，
 * 这是词典排版里唯一能表达「这是同一个义项的续行」的办法（先前靠一层圆角盒子）。
 *
 * `minWidth: 0` 与行尾槽的 `flex: none` 是一对：长释义因此会折行而不是把行尾的
 * 来源标与勾选框挤出视野。
 */
export default function FlowRow({ no, children, end, state = 'original' }: {
  no?: number | string
  children: ReactNode
  end?: ReactNode
  state?: FieldState
}) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '4px 0 4px 11px', position: 'relative' }}>
      <SourceBar state={state} />
      <span style={{ width: '18px', flex: 'none', fontSize: '12.5px', textAlign: 'right',
                     color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>
        {no}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '15px', lineHeight: 1.75 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
          {end && <span style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>{end}</span>}
        </span>
      </span>
    </div>
  )
}
