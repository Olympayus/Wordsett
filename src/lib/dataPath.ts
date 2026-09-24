import { invoke } from '@tauri-apps/api/core'

// 在系统文件管理器中打开本地数据目录并选中 wordsett.db（v0.5.3 §4.2）
export function openDataDir(): Promise<void> {
  return invoke('open_data_dir')
}
