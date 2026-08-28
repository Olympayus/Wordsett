export const DOMAIN_LABELS: Record<string, string> = {
  biology: '生物', physics: '物理', chemistry: '化学', medicine: '医学',
  law: '法律', music: '音乐', sports: '体育', baseball: '棒球',
  linguistics: '语言学', mathematics: '数学', psychology: '心理学',
  'united kingdom': '英国',
}

export function domainLabel(headWord: string): string {
  const key = headWord.toLowerCase()
  return DOMAIN_LABELS[key] ?? headWord
}