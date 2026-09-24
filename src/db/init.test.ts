import { describe, it, expect } from 'vitest'
import { ensureSchema } from './init'
import { SCHEMA_SEED_STATEMENTS, SCHEMA_VERSION } from './schema'
import { createRawTestDb } from './test-utils'

describe('db/init ensureSchema', () => {
  it('空库：建表并写入版本号', async () => {
    const { adapter } = await createRawTestDb()
    await ensureSchema(adapter)
    const tables = await adapter.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('words','field_definitions','field_values','categories','word_categories')"
    )
    expect(tables.length).toBe(5)
    const v = await adapter.select<{ user_version: number }>('SELECT user_version FROM pragma_user_version')
    expect(v[0].user_version).toBe(SCHEMA_VERSION)
  })

  it('版本一致：不重建，数据保留', async () => {
    const { adapter } = await createRawTestDb()
    await ensureSchema(adapter)
    await adapter.execute(
      "INSERT INTO words (id, lemma, normalized_lemma, language, created_at, updated_at) VALUES ('w1','keep','keep','en',1,1)"
    )
    await ensureSchema(adapter)
    const rows = await adapter.select<{ c: number }>('SELECT count(*) as c FROM words')
    expect(rows[0].c).toBe(1)
  })

  it('v0 空库：重建并写入版本号', async () => {
    const { adapter } = await createRawTestDb()
    await adapter.execute(`PRAGMA user_version = 0`)
    await ensureSchema(adapter)
    const v = await adapter.select<{ user_version: number }>('SELECT user_version FROM pragma_user_version')
    expect(v[0].user_version).toBe(SCHEMA_VERSION)
  })

  it('版本一致但缺内置字段：幂等补种，不重建、不丢数据', async () => {
    const { adapter } = await createRawTestDb()
    await ensureSchema(adapter)
    // 模拟现存 v0.3.0 库：版本号一致但 field_definitions 缺 6 个新内置字段之一（phrase）
    await adapter.execute("DELETE FROM field_definitions WHERE key = 'phrase'")
    await adapter.execute(
      "INSERT INTO words (id, lemma, normalized_lemma, language, created_at, updated_at) VALUES ('w3','keep','keep','en',1,1)"
    )
    await ensureSchema(adapter)
    const defs = await adapter.select<{ c: number }>("SELECT count(*) as c FROM field_definitions WHERE key = 'phrase'")
    expect(defs[0].c).toBe(1)
    const words = await adapter.select<{ c: number }>('SELECT count(*) as c FROM words')
    expect(words[0].c).toBe(1)
  })

  it('版本一致：老库派生词字段名幂等迁移为「词源相关词」', async () => {
    const { adapter } = await createRawTestDb()
    await ensureSchema(adapter)
    // 模拟老库（v0.4.2）：字段定义仍是旧名「派生词」
    await adapter.execute("UPDATE field_definitions SET name = '派生词' WHERE key = 'derivatives'")
    await ensureSchema(adapter)
    const rows = await adapter.select<{ name: string }>("SELECT name FROM field_definitions WHERE key = 'derivatives'")
    expect(rows[0].name).toBe('词源相关词')
  })

  it('v3 旧库升级：词库行数不变 + 复习三表补建', async () => {
    const { adapter } = await createRawTestDb()
    // 模拟 v3 库：建旧表 + 灌一行词 + 版本号写 3
    for (const sql of SCHEMA_SEED_STATEMENTS) await adapter.execute(sql)
    await adapter.execute(`PRAGMA user_version = 3`)
    await adapter.execute(
      "INSERT INTO words (id, lemma, normalized_lemma, language, created_at, updated_at) VALUES ('w9','survive','survive','en',1,1)"
    )
    await ensureSchema(adapter)
    const words = await adapter.select<{ c: number }>('SELECT count(*) as c FROM words')
    expect(words[0].c).toBe(1)
    const tables = await adapter.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('review_cards','review_states','review_logs')"
    )
    expect(tables.length).toBe(3)
    const v = await adapter.select<{ user_version: number }>('SELECT user_version FROM pragma_user_version')
    expect(v[0].user_version).toBe(SCHEMA_VERSION)
  })
})
