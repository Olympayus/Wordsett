import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { ensureDictionaries, type DictionaryStatus } from '../../../services/dictionaryBootstrap'
import { gateModel } from '../../../lib/dictionaryGate'

interface Props {
  children: ReactNode
}

/**
 * Android 手机外壳的启动 gate（Task 3 交付组件，由 Task 4 在 IndexPage 挂载）。
 *
 * 词典库在 APK 里不是普通文件，首启必须先由 `ensure_dictionaries` 复制到
 * app_data_dir 才能被 sqlite 打开；未就绪时整页拦住，就绪后渲染 children。
 *
 * 组件**不做状态判断**——`gateModel` 是「显示什么」的唯一出处，这里只渲染它的结论。
 * 只有失败态出重试按钮（重试即重新 invoke `ensure_dictionaries`）。
 */
export function MobileBootstrapGate({ children }: Props) {
  const [status, setStatus] = useState<DictionaryStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(() => {
    setError(null)
    ensureDictionaries()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    run()
  }, [run])

  const model = gateModel(status, error)
  if (!model.blocking) return <>{children}</>

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        minHeight: '100dvh',
        padding: 24,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <p
        style={{
          margin: 0,
          color: 'var(--color-text-primary)',
          fontSize: 14,
          lineHeight: 1.6,
          textAlign: 'center',
        }}
      >
        {model.label}
      </p>
      {model.canRetry ? <Button onClick={run}>重试</Button> : null}
    </div>
  )
}
