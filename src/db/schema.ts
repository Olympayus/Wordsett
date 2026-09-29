import type { FieldKey } from '../types/field'
import { BUILTIN_FIELDS } from '../types/field'

export const SQL_CREATE_WORDS = `CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL,
  normalized_lemma TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`

export const SQL_CREATE_FIELD_DEFINITIONS = `CREATE TABLE IF NOT EXISTS field_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  field_type TEXT NOT NULL DEFAULT 'text',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);`

export const SQL_CREATE_FIELD_VALUES = `CREATE TABLE IF NOT EXISTS field_values (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  value TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  edited INTEGER NOT NULL DEFAULT 0,
  original_value TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT REFERENCES field_values(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`

export const SQL_CREATE_CATEGORIES = `CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`

export const SQL_CREATE_WORD_CATEGORIES = `CREATE TABLE IF NOT EXISTS word_categories (
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (word_id, category_id)
);`

export const SQL_CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_fv_word_id ON field_values(word_id);
  CREATE INDEX IF NOT EXISTS idx_wc_word_id ON word_categories(word_id);
  CREATE INDEX IF NOT EXISTS idx_wc_category_id ON word_categories(category_id);
`

export function seedFieldDefinitionsSQL(): string {
  const now = Date.now()
  const rows = (Object.entries(BUILTIN_FIELDS) as [string, typeof BUILTIN_FIELDS[FieldKey]][])
    .map(([key, def]) => {
      const id = `f_${key}`
      return `('${id}','${def.name}','${key}','${def.fieldType}',${def.displayOrder},${now})`
    }).join(',\n')
  return `INSERT OR IGNORE INTO field_definitions VALUES ${rows};`
}

// PRAGMA user_version：当前 schema 版本。变更 schema 时递增此值。
// v0.6.5 进位到 6 是**书签不是迁移**：本次只换 review_cards 的形状，且形状不符时由
// ensureSchema 的守卫整表丢弃重建（见 init.ts 与 REVIEW_DROP_STATEMENTS），不做数据迁移。
// 上一版 v0.6.4 的 5 同理是书签：只新增一个内置字段，字段种子走 seedFieldDefinitionsSQL()
// 的 INSERT OR IGNORE、每次启动无条件执行。进位只为让「本版动过 schema」在
// pragma_user_version 上留痕，便于真机回归时一眼看出库是新是旧。
export const SCHEMA_VERSION = 6

// ensureSchema 的重建门限（见 init.ts）。这是**版本门，不是空库判定**：user_version 低于此值
// 就 DROP 重建，哪怕库里已有数据。与 SCHEMA_VERSION 有意解耦——让它跟着 SCHEMA_VERSION 一起涨，
// 下一次 schema 变更就会开始清空 v3 用户的数据库。
export const REBUILD_BELOW_VERSION = 3

// 重建时的 DROP 顺序＝外键依赖的反向（先子表后父表）：
// review_logs / review_states → review_cards → word_categories / field_values → words。
// 复习三表必须列进来：上一次中断的 init 可能已经建过它们，残留表会带着指向已删表的悬空外键。
export const SQL_DROP_TABLES: string[] = [
  'DROP TABLE IF EXISTS review_logs;',
  'DROP TABLE IF EXISTS review_states;',
  'DROP TABLE IF EXISTS review_cards;',
  'DROP TABLE IF EXISTS word_categories;',
  'DROP TABLE IF EXISTS categories;',
  'DROP TABLE IF EXISTS field_values;',
  'DROP TABLE IF EXISTS field_definitions;',
  'DROP TABLE IF EXISTS words;',
]

// 卡模型换代（v0.6.5）时要丢弃的表：外键依赖的反向（先子表后父表），
// 与 SQL_DROP_TABLES 的前三行逐字一致——两边任何一处改动都要同步，顺序错了守卫会用到错的顺序。
export const REVIEW_DROP_STATEMENTS: string[] = [
  'DROP TABLE IF EXISTS review_logs;',
  'DROP TABLE IF EXISTS review_states;',
  'DROP TABLE IF EXISTS review_cards;',
]

// 建表 + seed 全量语句（init 与测试基建共享，避免两处漂移）
export const SCHEMA_SEED_STATEMENTS: string[] = [
  SQL_CREATE_WORDS, SQL_CREATE_FIELD_DEFINITIONS, SQL_CREATE_FIELD_VALUES,
  SQL_CREATE_CATEGORIES, SQL_CREATE_WORD_CATEGORIES,
  SQL_CREATE_INDEXES, seedFieldDefinitionsSQL(),
]

// 复习卡（v0.6.5 起为「词 × 题型」）：一个词每种可用题型各一张卡，各自一条 review_states。
export const SQL_CREATE_REVIEW_CARDS = `CREATE TABLE IF NOT EXISTS review_cards (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`

export const SQL_CREATE_REVIEW_STATES = `CREATE TABLE IF NOT EXISTS review_states (
  card_id TEXT PRIMARY KEY REFERENCES review_cards(id) ON DELETE CASCADE,
  stability REAL,
  difficulty REAL,
  due_at INTEGER NOT NULL,
  lapses INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  last_review_at INTEGER
);`

export const SQL_CREATE_REVIEW_LOGS = `CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES review_cards(id) ON DELETE CASCADE,
  reviewed_at INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  template TEXT,
  mode TEXT NOT NULL DEFAULT 'review',
  duration_ms INTEGER
);`

export const REVIEW_INDEXES: string[] = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_word_template ON review_cards(word_id, template);',
  'CREATE INDEX IF NOT EXISTS idx_states_due ON review_states(suspended, due_at);',
  'CREATE INDEX IF NOT EXISTS idx_logs_card ON review_logs(card_id, reviewed_at);',
]

export const REVIEW_TABLES: string[] = [
  SQL_CREATE_REVIEW_CARDS, SQL_CREATE_REVIEW_STATES, SQL_CREATE_REVIEW_LOGS,
  ...REVIEW_INDEXES,
]
