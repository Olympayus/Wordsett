// src/components/settings/DataSettings.tsx
import { useState } from 'react'
import { exportLibrary } from '../../services/exportService'
import { pickAndPlanImport, applyImport } from '../../services/importService'
import type { ImportPlan } from '../../lib/libraryCodec'
import { useWordStore } from '../../stores/wordStore'
import { useCategoryStore } from '../../stores/categoryStore'

// v0.5.3 §4.1（第 11 条）：小标题字号 +2（--text-sm 13px → --text-base 15px）并加粗。
// 原为 raw 600（≈ --weight-semibold），这里一并提到 --weight-bold，与 SearchSettings / SidebarSettings 的小标题一致。
const SECTION_TITLE: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)' }

export default function DataSettings() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)

  const fmt = (p: ImportPlan) =>
    `新增 ${p.newWords} 词 / 更新 ${p.updatedWords} 词，新增分类 ${p.newCategories}、字段定义 ${p.newFieldDefinitions}、字段值 ${p.newFieldValues}、词分类 ${p.newWordCategories}，跳过 ${p.skipped}`

  const handleExport = async () => {
    setBusy(true); setError(''); setStatus('')
    const r = await exportLibrary()
    setBusy(false)
    if (r.ok) setStatus(`已导出：${r.path}`)
    else if (r.error) setError(r.error)
  }

  const handlePick = async () => {
    setBusy(true); setError(''); setStatus(''); setPlan(null); setPendingPath(null)
    const r = await pickAndPlanImport()
    setBusy(false)
    if (r.ok && r.plan) { setPlan(r.plan); setPendingPath(r.path ?? null) }
    else if (r.error) setError(r.error)
  }

  const handleApply = async () => {
    if (!pendingPath) return
    setBusy(true); setError(''); setStatus('')
    const r = await applyImport(pendingPath)
    setBusy(false)
    if (r.ok) {
      setStatus('导入完成'); setPlan(null); setPendingPath(null)
      // 导入后刷新侧边栏/工作台数据，让新词与分类即时可见（与 IndexPage 启动加载一致）
      await useWordStore.getState().loadWords()
      await useCategoryStore.getState().loadCategories()
      await useCategoryStore.getState().loadWordCategoryMap()
    }
    else if (r.error) setError(r.error)
  }

  const btn: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-strong)',
    background: 'var(--color-surface)', color: 'var(--color-text-primary)', cursor: 'pointer',
    fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ ...SECTION_TITLE, marginBottom: '6px' }}>导出词库</div>
        <button style={btn} onClick={handleExport} disabled={busy}>导出为备份文件</button>
      </div>
      <div>
        <div style={{ ...SECTION_TITLE, marginBottom: '6px' }}>导入词库</div>
        <button style={btn} onClick={handlePick} disabled={busy}>选择备份文件…</button>
        {plan && (
          <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--color-brand-soft)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
            <div>{fmt(plan)}</div>
            <button
              style={{ ...btn, marginTop: '8px', background: 'var(--color-brand)', color: 'white', border: 'none' }}
              onClick={handleApply}
              disabled={busy}
            >确认导入</button>
          </div>
        )}
      </div>
      {status && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>{status}</div>}
      {error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</div>}
    </div>
  )
}
