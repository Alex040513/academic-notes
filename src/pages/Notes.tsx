import { BookOpen, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { isDue } from '../lib/srs'
import { Empty, NoteCard } from '../components/ui'

type SortKey = 'recent' | 'due' | 'created'

export function Notes() {
  const { notes } = useStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [course, setCourse] = useState<string>('')
  const [sort, setSort] = useState<SortKey>('recent')

  const courses = useMemo(
    () => Array.from(new Set(notes.map((n) => n.course).filter(Boolean))).sort(),
    [notes],
  )

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [notes])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = notes.filter((n) => {
      if (tag && !n.tags.includes(tag)) return false
      if (course && n.course !== course) return false
      if (!needle) return true
      return (
        n.title.toLowerCase().includes(needle) ||
        n.body.toLowerCase().includes(needle) ||
        n.tags.some((t) => t.toLowerCase().includes(needle))
      )
    })
    list = [...list].sort((a, b) => {
      if (sort === 'due') return a.review.due.localeCompare(b.review.due)
      if (sort === 'created') return b.created.localeCompare(a.created)
      return b.updated.localeCompare(a.updated)
    })
    return list
  }, [notes, q, tag, course, sort])

  const dueCount = filtered.filter((n) => isDue(n.review)).length

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight text-stone-900">知识库</h1>
        <p className="mt-1 text-sm text-stone-500">
          共 {notes.length} 个知识点{dueCount > 0 && `，其中 ${dueCount} 个已到期`}
        </p>
      </header>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题、正文或标签"
            className="input pl-9 pr-9"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              aria-label="清空搜索"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="input w-auto shrink-0 text-sm"
        >
          <option value="recent">最近更新</option>
          <option value="due">按复习日期</option>
          <option value="created">按创建时间</option>
        </select>
      </div>

      {(tagCounts.length > 0 || courses.length > 0) && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setTag(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
              tag === null ? 'bg-teal-800 text-white' : 'border border-stone-200 bg-white text-stone-500'
            }`}
          >
            全部
          </button>
          {tagCounts.map(([t, c]) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                tag === t
                  ? 'bg-teal-800 text-white'
                  : 'border border-stone-200 bg-white text-stone-500 hover:border-teal-300'
              }`}
            >
              {t} <span className={tag === t ? 'text-teal-200' : 'text-stone-300'}>{c}</span>
            </button>
          ))}
        </div>
      )}

      {courses.length > 0 && (
        <select value={course} onChange={(e) => setCourse(e.target.value)} className="input w-auto text-sm">
          <option value="">全部课程</option>
          {courses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {filtered.length ? (
        <div className="space-y-2.5">
          {filtered.map((n) => (
            <NoteCard key={n.id} note={n} onClick={() => navigate(`/notes/${n.id}`)} />
          ))}
        </div>
      ) : notes.length ? (
        <Empty icon={<Search className="h-7 w-7" />} title="没有匹配的知识点" hint="换个关键词，或清掉筛选条件试试。" />
      ) : (
        <Empty
          icon={<BookOpen className="h-7 w-7" />}
          title="知识库还是空的"
          hint="去「今日」页把上课记的内容丢进来，就会出现在这里。"
        />
      )}
    </div>
  )
}
