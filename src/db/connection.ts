import Database from '@tauri-apps/plugin-sql'
import { ensureSchema, type DbHandle } from './init'

let db: Database | null = null

export async function initDatabase(): Promise<void> {
  if (db) return
  db = await Database.load('sqlite:wordsett.db')
  await ensureSchema(db as unknown as DbHandle)
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}
