export function countMatches(text: string, query: string): number {
  if (!query.trim()) return 0
  const lower = text.toLowerCase()
  const q = query.trim().toLowerCase()
  let count = 0
  let i = lower.indexOf(q)
  while (i !== -1) { count++; i = lower.indexOf(q, i + q.length) }
  return count
}
