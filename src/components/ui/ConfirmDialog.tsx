import { useUiStore } from '../../stores/uiStore'
import { scrimDismisses } from '../../lib/confirmDialog'

export default function ConfirmDialog() {
  const req = useUiStore(s => s.confirmReq)
  const resolveConfirm = useUiStore(s => s.resolveConfirm)
  if (!req) return null

  const danger = req.danger ?? false
  const confirmLabel = req.confirmLabel ?? (req.alertMode ? '确定' : '删除')

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
        background: 'var(--color-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => { if (scrimDismisses(req.dismissable)) resolveConfirm(false) }}
    >
      <div
        style={{
          width: 360, maxWidth: '90vw', background: 'var(--color-surface)', borderRadius: 10,
          boxShadow: 'var(--shadow-overlay)', padding: '18px', fontFamily: 'var(--font-sans)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          {req.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
          {req.message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {!req.alertMode && (
            <button
              type="button"
              onClick={() => resolveConfirm(false)}
              style={{
                padding: '6px 14px', border: '1px solid var(--color-border)', borderRadius: 6,
                background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {req.cancelLabel ?? '取消'}
            </button>
          )}
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            style={{
              padding: '6px 14px', borderRadius: 6,
              // v0.7.2 §6 规则 2：肯定动作不再是品牌蓝实底——非危险走中性配方
              // （浅暖灰底 + 1px 深描边，与 Button/SquareButton 同一语言）；
              // 危险动作用 --color-danger（§6 规则 3 的对错/危险色），白字保留。
              border: danger ? 'none' : '1px solid var(--color-hairline)',
              background: danger ? 'var(--color-danger)' : 'var(--color-border)',
              color: danger ? 'var(--color-surface)' : 'var(--color-text-primary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
