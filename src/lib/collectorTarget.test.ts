import { describe, it, expect } from 'vitest'
import {
  STOPWORDS,
  tokenize,
  stripWordSelection,
  contentCandidates,
  pickDefaultTarget,
} from './collectorTarget'

describe('句子模式目标词与内容词（v0.7.9）', () => {
  it('strip_word_selection_handles_punctuation', () => {
    expect(stripWordSelection('  “ephemeral,”  ')).toBe('ephemeral')
    expect(stripWordSelection('well-known')).toBe('well-known')
    expect(stripWordSelection("don't")).toBe("don't")
  })

  // 中文/全角标点也必须在两端剥掉（选区常把句读一起带进来）。
  it('strip_word_selection_strips_cjk_punctuation', () => {
    expect(stripWordSelection('「ephemeral。」')).toBe('ephemeral')
    expect(stripWordSelection('  你好，  ')).toBe('你好')
    expect(stripWordSelection('。,！')).toBe('')
  })

  it('tokens_match_rust_split_rules', () => {
    expect(tokenize("Hello, world! It's well-known.")).toEqual(['Hello', 'world', "It's", 'well-known'])
  })

  // 与 Rust `selection::tokens` 的既有用例逐字对齐（纯标点 → 空数组）。
  it('tokens_drop_punctuation_only_pieces', () => {
    expect(tokenize('  。，！  ')).toEqual([])
    expect(tokenize('— — а')).toEqual(['а'])
  })

  it('candidate_order_is_frequency_ascending_and_deduped', () => {
    const freqs: Record<string, number> = { beauty: 9000, ephemeral: 10, fades: 500 }
    const c = contentCandidates('The ephemeral beauty of cherry blossoms fades within days and ephemeral again', w => freqs[w.toLowerCase()])
    expect(c.map(x => x.word)).toEqual(['ephemeral', 'fades', 'beauty', 'cherry', 'blossoms', 'days'])
    expect(c.length).toBeLessThanOrEqual(9)
  })

  it('falls_back_to_all_non_numeric_tokens_when_all_stopwords', () => {
    const c = contentCandidates('the of a', () => 1)
    expect(c.map(x => x.word)).toEqual(['the', 'of', 'a'])
  })

  it('filters_short_tokens_and_pure_numbers', () => {
    expect(contentCandidates('a I 123 42 apple', () => 1).map(x => x.word)).toEqual(['apple'])
    // 全是数字时内容词与回退都是空。
    expect(contentCandidates('123 456', () => 1)).toEqual([])
  })

  it('dedupes_case_insensitively_keeping_first_form', () => {
    expect(contentCandidates('Ephemeral ephemeral EPHEMERAL', () => 0).map(x => x.word)).toEqual(['Ephemeral'])
  })

  it('caps_candidates_at_nine', () => {
    const words = Array.from({ length: 12 }, (_, i) => `word${String.fromCharCode(97 + i)}`)
    expect(contentCandidates(words.join(' '), () => 1)).toHaveLength(9)
  })

  it('exports_a_stopword_set', () => {
    expect(STOPWORDS.has('the')).toBe(true)
    expect(STOPWORDS.has('again')).toBe(true)
    expect(STOPWORDS.has('ephemeral')).toBe(false)
  })

  it('pick_default_target_prefers_lowest_frequency', () => {
    expect(pickDefaultTarget([{ word: 'beauty', freq: 9000 }, { word: 'ephemeral', freq: 10 }])?.word).toBe('ephemeral')
  })

  it('pick_default_target_returns_null_on_empty', () => {
    expect(pickDefaultTarget([])).toBeNull()
  })
})
