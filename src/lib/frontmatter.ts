import { newReview, dateStr } from './srs'
import type { Note, Review } from './types'

/**
 * 文件格式（刻意保持人类可读、扁平，方便你用任何编辑器直接改）：
 *
 * ---
 * id: "1732600000000"
 * title: "定语从句 vs 同位语从句"
 * course: "学术英语"
 * tags: [从句, 易混点]
 * created: 2026-11-26T09:12:00.000Z
 * updated: 2026-11-26T09:12:00.000Z
 * due: 2026-11-27
 * interval: 1
 * ease: 2.5
 * reps: 0
 * lapses: 0
 * ---
 *
 * 正文...
 */

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)?/

function unquote(v: string): string {
  const t = v.trim()
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return t
}

function unquoteList(v: string): string[] {
  const t = v.trim()
  if (!t) return []
  const inner = t.startsWith('[') && t.endsWith(']') ? t.slice(1, -1) : t
  return inner
    .split(',')
    .map((s) => unquote(s))
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 只在需要时才加引号，让文件尽量干净 */
export function quoteIfNeeded(v: string): string {
  const s = String(v ?? '')
  if (!s) return '""'
  if (/^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|[\n\r]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}

export function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()_|+=?;:'",.<>[\]{}\\\/]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return base || 'note'
}

export function notePath(note: Pick<Note, 'id' | 'title'>): string {
  return `notes/${note.id}-${slugify(note.title)}.md`
}

export function parseNote(path: string, raw: string, sha?: string): Note {
  let meta: Record<string, string> = {}
  let body = raw

  const m = raw.match(FM_RE)
  if (m) {
    body = raw.slice(m[0].length)
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/)
      if (kv) meta[kv[1]] = kv[2]
    }
  }

  const id = unquote(meta.id || '') || path.replace(/^notes\//, '').replace(/\.md$/, '').split('-')[0]
  const created = unquote(meta.created || '') || new Date().toISOString()
  const updated = unquote(meta.updated || '') || created

  const review: Review = {
    due: unquote(meta.due || '') || dateStr(),
    interval: Number(meta.interval) || 0,
    ease: Number(meta.ease) || 2.5,
    reps: Number(meta.reps) || 0,
    lapses: Number(meta.lapses) || 0,
  }

  const fallbackTitle =
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    body.split('\n').find((l) => l.trim())?.trim().slice(0, 60) ||
    '未命名知识点'

  return {
    id,
    path,
    title: unquote(meta.title || '') || fallbackTitle,
    course: unquote(meta.course || ''),
    tags: unquoteList(meta.tags || ''),
    body: body.replace(/^\s*\n/, ''),
    created,
    updated,
    review,
    sha,
  }
}

export function serializeNote(n: Note): string {
  const lines = [
    '---',
    `id: ${JSON.stringify(n.id)}`,
    `title: ${quoteIfNeeded(n.title)}`,
    `course: ${quoteIfNeeded(n.course)}`,
    `tags: [${n.tags.map((t) => quoteIfNeeded(t)).join(', ')}]`,
    `created: ${n.created}`,
    `updated: ${n.updated}`,
    `due: ${n.review.due}`,
    `interval: ${n.review.interval}`,
    `ease: ${round2(n.review.ease)}`,
    `reps: ${n.review.reps}`,
    `lapses: ${n.review.lapses}`,
    '---',
    '',
    n.body.trim(),
    '',
  ]
  return lines.join('\n')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function makeNote(input: {
  title: string
  course?: string
  tags?: string[]
  body: string
  review?: Review
}): Note {
  const now = new Date()
  const id = String(now.getTime())
  const note: Note = {
    id,
    path: '',
    title: input.title.trim() || '未命名知识点',
    course: input.course?.trim() || '',
    tags: dedupeTags(input.tags || []),
    body: input.body.trim(),
    created: now.toISOString(),
    updated: now.toISOString(),
    review: input.review || newReview(),
  }
  note.path = notePath(note)
  return note
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/** 从正文里猜一个标题，用于"存下来"时没写标题的情况 */
export function guessTitle(body: string): string {
  const firstLine =
    body
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .find(Boolean) || ''
  // 只在句末标点处断开，避免把 "I think" 这类英文词组切碎
  const sentence = (firstLine.split(/[。！!？?]/)[0] || '').trim()
  const t = sentence || '未命名知识点'
  return t.length > 24 ? `${t.slice(0, 24)}…` : t
}
