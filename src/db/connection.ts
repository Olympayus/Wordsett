import Database from '@tauri-apps/plugin-sql'
import { ensureSchema, type DbHandle } from './init'
import { pragmaStatements } from '../lib/dbReady'

let db: Database | null = null

/**
 * v0.7.9：主窗与划词小窗共用同一个 SQLite 文件，初始化时先设 pragma
 * （busy_timeout + WAL）再建/迁移表。小窗传 `ensureSchema: false`，
 * 只负责连库，schema 由主窗的唯一一次初始化负责。
 */
export async function initDatabase(opts: { ensureSchema?: boolean } = {}): Promise<void> {
  if (db) return
  db = await Database.load('sqlite:wordsett.db')
  for (const sql of pragmaStatements()) await db.execute(sql)
  if (opts.ensureSchema !== false) await ensureSchema(db as unknown as DbHandle)
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
