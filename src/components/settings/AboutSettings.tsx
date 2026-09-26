import pkg from '../../../package.json'
import { useUpdaterStore } from '../../stores/updaterStore'
import SquareButton from '../ui/SquareButton'

export default function AboutSettings() {
  const checkManually = useUpdaterStore(s => s.checkManually)
  const checking = useUpdaterStore(s => s.phase === 'checking')
  return (
    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
      <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>Wordsett</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--color-text-primary)' }}>版本：v{pkg.version}</span>
        {/* 检查中走 SquareButton 自带的灰底 + 0.55 不透明度 + default 光标（v0.5.3 §4.1 第 16 条的统一样式），
            原来的手写透明底 + 描边 + 三级灰字一并去掉。 */}
        <SquareButton onClick={() => { void checkManually() }} disabled={checking}>
          检查更新
        </SquareButton>
      </div>
    </div>
  )
}
