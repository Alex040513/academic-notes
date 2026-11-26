import { ArrowLeft, Check, Eye, ListChecks, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { Spinner, TagInput } from '../components/ui'
import { useStore } from '../lib/store'
import { addDays, dateStr, dueLabel } from '../lib/srs'

const SCHEDULE_OPTIONS = [
  { label: '今天', days: 0 },
  { label: '明天', days: 1 },
  { label: '3 天后', days: 3 },
  { label: '7 天后', days: 7 },
  { label: '30 天后', days: 30 },
]

export function NoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { notes, updateNote, deleteNote, knownTags, notify, ready } = useStore()

  const note = notes.find((n) => n.id === id)

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [course, setCourse] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  // 只在切换到另一条笔记时重置草稿，避免同步后覆盖正在编辑的内容
  useEffect(() => {
    if (!note) return
    setTitle(note.title)
    setCourse(note.course)
    setTags(note.tags)
    setBody(note.body)
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  const dirty = useMemo(() => {
    if (!note) return false
    return (
      title !== note.title ||
      course !== note.course ||
      body !== note.body ||
      tags.join('|') !== note.tags.join('|')
    )
  }, [note, title, course, body, tags])

  if (!note) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-stone-500">{ready ? '没有找到这个知识点，可能已经被删除了。' : '加载中…'}</p>
        <Link to="/notes" className="btn-soft mt-4">
          回知识库
        </Link>
      </div>
    )
  }

  async function handleSave() {
    if (!note) return
    setSaving(true)
    try {
      await updateNote(note, { title: title.trim() || note.title, course, tags, body })
      setEditing(false)
      notify('已保存', 'ok')
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!note) return
    if (!window.confirm(`确定删除「${note.title}」吗？\n云端仓库里的文件也会一起删掉。`)) return
    try {
      await deleteNote(note)
      notify('已删除', 'ok')
      navigate('/notes')
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'err')
    }
  }

  async function schedule(days: number) {
    if (!note) return
    try {
      await updateNote(note, { review: { ...note.review, due: addDays(dateStr(), days) } })
      notify(days === 0 ? '已排进今天的复习' : `已安排在 ${days} 天后复习`, 'ok')
    } catch (e) {
      notify(e instanceof Error ? e.message : '安排失败', 'err')
    }
  }

  return (
    <article className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/notes" className="btn-ghost -ml-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> 知识库
        </Link>
        <div className="flex items-center gap-1">
          <button
            className="btn-ghost"
            onClick={() => setEditing((v) => !v)}
            title={editing ? '预览' : '编辑'}
          >
            {editing ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            <span className="hidden sm:inline">{editing ? '预览' : '编辑'}</span>
          </button>
          <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={() => void handleDelete()} title="删除">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <header className="space-y-3">
        {editing ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input font-serif text-lg"
              placeholder="标题"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">课程</label>
                <input value={course} onChange={(e) => setCourse(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">标签</label>
                <TagInput value={tags} onChange={setTags} suggestions={knownTags} />
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-serif text-[26px] font-semibold leading-snug tracking-tight text-stone-900">
              {note.title}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              {note.course && <span className="chip">{note.course}</span>}
              {note.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                </span>
              ))}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                  note.review.due <= dateStr() ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-500'
                }`}
              >
                {dueLabel(note.review.due)} · 已复习 {note.review.reps} 次
              </span>
            </div>
          </>
        )}
      </header>

      <div className="card p-5">
        {editing ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[320px] w-full resize-y border-0 bg-transparent text-[15px] leading-7 text-stone-800 outline-none"
            placeholder="支持 Markdown：## 小标题、- 列表、**加粗**"
          />
        ) : (
          <Markdown text={note.body} />
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={() => void handleSave()} disabled={saving || !dirty}>
            {saving ? <Spinner /> : <Check className="h-4 w-4" />} 保存修改
          </button>
          <button
            className="btn-soft"
            onClick={() => {
              setTitle(note.title)
              setCourse(note.course)
              setTags(note.tags)
              setBody(note.body)
              setEditing(false)
            }}
          >
            <Undo2 className="h-4 w-4" /> 放弃修改
          </button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">复习安排</h2>
        <div className="flex flex-wrap gap-1.5">
          {SCHEDULE_OPTIONS.map((o) => (
            <button
              key={o.label}
              onClick={() => void schedule(o.days)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 transition hover:border-teal-400 hover:text-teal-800"
            >
              {o.label}
            </button>
          ))}
        </div>
        <Link
          to="/quiz"
          state={{ noteId: note.id }}
          className="btn-soft mt-2 w-full sm:w-auto"
        >
          <ListChecks className="h-4 w-4" /> 就这张笔记出题
        </Link>
      </section>

      <footer className="border-t border-stone-200/70 pt-4 text-[11px] leading-5 text-stone-400">
        <p>
          创建于 {new Date(note.created).toLocaleString('zh-CN')} · 更新于{' '}
          {new Date(note.updated).toLocaleString('zh-CN')}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-stone-300">{note.path}</p>
      </footer>
    </article>
  )
}
