import type { Grade, Review } from './types'

const DAY = 86_400_000

/** 本地时区的 YYYY-MM-DD（不能用 toISOString，那会跑到 UTC 上） */
export function dateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  return dateStr(new Date(d.getTime() + n * DAY))
}

/** 两个日期相差的天数（正数表示 a 在 b 之后） */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / DAY)
}

export function newReview(): Review {
  return { due: dateStr(), interval: 0, ease: 2.5, reps: 0, lapses: 0 }
}

export function isDue(r: Review, today: string = dateStr()): boolean {
  return r.due <= today
}

/**
 * 简化版 SM-2：
 * 忘了 → 回到 1 天，难度上升
 * 模糊 → 间隔小幅增长（×1.2），难度略升
 * 记得 → 间隔 × 难度系数，且逐步拉长
 */
export function applyGrade(r: Review, grade: Grade, today: string = dateStr()): Review {
  let { interval, ease, reps, lapses } = r

  if (grade === 'again') {
    lapses += 1
    reps = 0
    interval = 1
    ease = Math.max(1.3, ease - 0.2)
  } else if (grade === 'hard') {
    reps += 1
    interval = Math.max(1, Math.round(interval * 1.2) || 1)
    ease = Math.max(1.3, ease - 0.05)
  } else {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 3
    else interval = Math.max(1, Math.round(interval * ease))
    ease = Math.min(3.0, ease + 0.05)
  }

  interval = Math.min(interval, 365)
  return { due: addDays(today, interval), interval, ease, reps, lapses }
}

/** 这个知识点现在有多"生"：0 表示很熟，数字越大越需要看 */
export function weakness(r: Review): number {
  return r.lapses * 3 + (r.reps === 0 ? 2 : 0) + Math.max(0, 2.5 - r.ease) * 4
}

export function dueLabel(due: string, today: string = dateStr()): string {
  const d = diffDays(due, today)
  if (d < 0) return `逾期 ${-d} 天`
  if (d === 0) return '今天到期'
  if (d === 1) return '明天'
  return `${d} 天后`
}
