import pkg from '../../../package.json'
import { useUpdaterStore } from '../../stores/updaterStore'

export default function AboutSettings() {
  const checkManually = useUpdaterStore(s => s.checkManually)
  const checking = useUpdaterStore(s => s.phase === 'checking')
  return (
    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
      <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>Wordsett</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--color-text-primary)' }}>版本：v{pkg.version}</span>
        <button
          type="button"
          onClick={() => void checkManually()}
          disabled={checking}
          style={{
            padding: '4px 12px', border: '1px solid var(--color-border)', borderRadius: 6,
            background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 13, cursor: checking ? 'default' : 'pointer',
            fontFamily: 'var(--font-sans)', ...(checking ? { opacity: 0.5 } : {}),
          }}
        >
          检查更新
        </button>
      </div>
    </div>
  )
}
