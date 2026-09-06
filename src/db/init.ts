import { SCHEMA_SEED_STATEMENTS, SCHEMA_VERSION, SQL_DROP_TABLES, seedFieldDefinitionsSQL } from './schema'

// 与 tauri-plugin-sql Database 对齐的最小接口（与 test-utils.DbLike 同构）
export interface DbHandle {
  execute: (sql: string, params?: unknown[]) => Promise<void>
  select: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>
}

export async function ensureSchema(db: DbHandle): Promise<void> {
  const rows = await db.select<{ user_version: number }>('SELECT user_version FROM pragma_user_version')
  const current = rows[0]?.user_version ?? 0
  if (current !== SCHEMA_VERSION) {
    for (const sql of SQL_DROP_TABLES) await db.execute(sql)
    for (const sql of SCHEMA_SEED_STATEMENTS) await db.execute(sql)
    await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    return
  }
  // 版本一致：仍幂等补全新内置字段定义（INSERT OR IGNORE），不重建表、不丢数据
  await db.execute(seedFieldDefinitionsSQL())
  // v0.4.3 §6：派生词 → 词源相关词 字段名迁移（幂等；新库种子已是新名，此处兼容老库）
  await db.execute("UPDATE field_definitions SET name = '词源相关词' WHERE key = 'derivatives'")
  await db.execute("UPDATE field_definitions SET name = '词源相关词项' WHERE key = 'derivatives_item'")
  // 近义词辨析项为单行「word: 辨析」内容，编辑框用 text（幂等，兼容已建库的 multiline 旧值）
  await db.execute("UPDATE field_definitions SET field_type = 'text' WHERE key = 'synonym_discrimination_item'")
}
