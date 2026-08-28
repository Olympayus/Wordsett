// WordNet 指针符号 → 语义网络分组键
export const RELATED_LABEL: Record<string, string> = {
  '@': 'hypernyms', '@i': 'hypernyms',
  '~': 'hyponyms', '~i': 'hyponyms',
  '!': 'antonyms', '&': 'similarTo', '^': 'alsoSee', '+': 'derivatives',
  '#m': 'partWhole', '#p': 'partWhole', '#s': 'partWhole',
  '%m': 'partWhole', '%p': 'partWhole', '%s': 'partWhole',
  '*': 'entailments', '>': 'causes', '\\': 'pertainyms', '=': 'attributes', '$': 'verbGroups',
}