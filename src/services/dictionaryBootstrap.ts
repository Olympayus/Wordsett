// src/services/dictionaryBootstrap.ts
import { invoke } from '@tauri-apps/api/core'

/** 词典落盘结果。字段名是 Rust 端 serde 输出，不可变。 */
export interface DictionaryStatus {
  ready: boolean
  copied: boolean
  target: string
}

/** 首启把两份词典从 bundle resources 复制到 app_data_dir/dictionaries/。 */
export function ensureDictionaries(): Promise<DictionaryStatus> {
  return invoke<DictionaryStatus>('ensure_dictionaries')
}
