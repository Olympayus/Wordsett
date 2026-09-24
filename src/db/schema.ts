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

// D4：PRAGMA user_version 驱动重建。P4/P5 变更 schema 时递增此值。
export const SCHEMA_VERSION = 4

export const SQL_DROP_TABLES: string[] = [
  'DROP TABLE IF EXISTS word_categories;',
  'DROP TABLE IF EXISTS categories;',
  'DROP TABLE IF EXISTS field_values;',
  'DROP TABLE IF EXISTS field_definitions;',
  'DROP TABLE IF EXISTS words;',
]

// 建表 + seed 全量语句（init 与测试基建共享，避免两处漂移）
export const SCHEMA_SEED_STATEMENTS: string[] = [
  SQL_CREATE_WORDS, SQL_CREATE_FIELD_DEFINITIONS, SQL_CREATE_FIELD_VALUES,
  SQL_CREATE_CATEGORIES, SQL_CREATE_WORD_CATEGORIES,
  SQL_CREATE_INDEXES, seedFieldDefinitionsSQL(),
]

// 复习三表（v0.6.0，spec §3）。幂等建表，随每段交付补建。
export const SQL_CREATE_REVIEW_CARDS = `CREATE TABLE IF NOT EXISTS review_cards (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  last_template TEXT,
  initial_familiarity INTEGER NOT NULL DEFAULT 1,
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
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_word ON review_cards(word_id);',
  'CREATE INDEX IF NOT EXISTS idx_states_due ON review_states(suspended, due_at);',
  'CREATE INDEX IF NOT EXISTS idx_logs_card ON review_logs(card_id, reviewed_at);',
]

export const REVIEW_TABLES: string[] = [
  SQL_CREATE_REVIEW_CARDS, SQL_CREATE_REVIEW_STATES, SQL_CREATE_REVIEW_LOGS,
  ...REVIEW_INDEXES,
]
