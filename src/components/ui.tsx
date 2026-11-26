import { Loader2, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Note } from '../lib/types'
import { dueLabel, isDue } from '../lib/srs'

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} strokeWidth={2.5} />
}

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300/80 bg-white/40 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-stone-300">{icon}</div>}
      <p className="font-serif text-base text-stone-700">{title}</p>
      {hint && <p className="mt-1.5 max-w-xs text-sm leading-6 text-stone-400">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = '输入标签后回车',
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase()
    return suggestions.filter((s) => !value.includes(s) && (!q || s.toLowerCase().includes(q))).slice(0, 6)
  }, [draft, suggestions, value])

  function add(tag: string) {
    const t = tag.trim().replace(/^#/, '')
    if (!t) return
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setDraft('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-2 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/10">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800"
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="text-teal-600/60 hover:text-teal-800"
              aria-label={`移除 ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === ' ') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[7rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-stone-400"
        />
      </div>
      {filtered.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-stone-200 px-2 py-0.5 text-xs text-stone-500 transition hover:border-teal-300 hover:text-teal-700"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DueBadge({ note }: { note: Note }) {
  const due = isDue(note.review)
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
        due ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-500'
      }`}
    >
      {dueLabel(note.review.due)}
    </span>
  )
}

export function NoteCard({ note, onClick }: { note: Note; onClick?: () => void }) {
  const preview = note.body
    .replace(/[#>*`_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 92)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-stone-200/80 bg-white px-4 py-3.5 text-left transition hover:border-stone-300 hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-[15px] font-semibold leading-6 text-stone-900 group-hover:text-teal-800">
          {note.title}
        </h3>
        <DueBadge note={note} />
      </div>
      {preview && <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-stone-500">{preview}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {note.course && <span className="chip">{note.course}</span>}
        {note.tags.slice(0, 4).map((t) => (
          <span key={t} className="chip border-transparent bg-stone-50 text-stone-500">
            #{t}
          </span>
        ))}
      </div>
    </button>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">{children}</h2>
      {right}
    </div>
  )
}
