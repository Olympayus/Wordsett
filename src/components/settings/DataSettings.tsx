// src/components/settings/DataSettings.tsx
import { useState } from 'react'
import { exportLibrary } from '../../services/exportService'
import { pickAndPlanImport, applyImport } from '../../services/importService'
import type { ImportPlan } from '../../lib/libraryCodec'
import { useWordStore } from '../../stores/wordStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { openDataDir } from '../../lib/dataPath'
import SquareButton from '../ui/SquareButton'

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

  // 「浏览」打开数据目录（v0.5.3 §4.1 第 14 条）。Task 16 的 open_data_dir 返回
  // Result<(), String>，DB 不存在 / opener 调用失败都会 reject，故在此 try/catch
  // 接住并写入下方共用的 error 槽——不吞掉 rejection，否则只有控制台报
  // unhandled rejection、界面完全无反馈。失败文案与 handleExport/handlePick 一致
  // （e instanceof Error ? e.message : String(e)）。
  const handleBrowse = async () => {
    setError(''); setStatus('')
    try {
      await openDataDir()
    } catch (e) {
      setError(`打开数据目录失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 本地数据存储位置（v0.5.3 §4.1 第 14 条）：首行，黑色字体，附浏览按钮。
          浏览按钮用 SquareButton 的 row 尺寸（不限最小宽），紧跟文字其后。
          中间不留 flex:1 撑开占位——那会把按钮推到行尾，与「跟随其后」的意图相反。 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
      }}>
        <span>本地数据存储位置</span>
        <SquareButton size="row" onClick={() => { void handleBrowse() }} title="在系统文件管理器中打开数据目录并选中 wordsett.db">浏览</SquareButton>
      </div>
      <div>
        <div style={{ ...SECTION_TITLE, marginBottom: '6px' }}>导出词库</div>
        <SquareButton onClick={handleExport} disabled={busy}>导出为备份文件</SquareButton>
      </div>
      <div>
        <div style={{ ...SECTION_TITLE, marginBottom: '6px' }}>导入词库</div>
        <SquareButton onClick={handlePick} disabled={busy}>选择备份文件…</SquareButton>
        {plan && (
          <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--color-brand-soft)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
            <div>{fmt(plan)}</div>
            {/* 「确认导入」与上方两个按钮同款，不再单列品牌底 + 白字变体：
                变体色（--color-brand 浅品牌底 + 白字）与 SquareButton 的暖中性底 + 深字
                并列会让同一区块里出现两种按钮语言，且它所在的内嵌 plan 盒本身就是品牌色底，
                再压一个品牌按钮会糊在一起。统一底样后，唯一的区分靠它在 plan 盒内的位置。 */}
            <div style={{ marginTop: '8px' }}>
              <SquareButton onClick={handleApply} disabled={busy}>确认导入</SquareButton>
            </div>
          </div>
        )}
      </div>
      {status && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>{status}</div>}
      {error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</div>}
    </div>
  )
}
