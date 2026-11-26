import { ArrowRight, Check, Sparkles, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AIError, structureNote } from '../lib/ai'
import { guessTitle } from '../lib/frontmatter'
import { useStore } from '../lib/store'
import { dateStr, isDue } from '../lib/srs'
import type { Note } from '../lib/types'
import { Markdown } from '../components/Markdown'
import { Empty, NoteCard, SectionTitle, Spinner, TagInput } from '../components/ui'

const DRAFT_KEY = 'aen.draft.v1'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function Today() {
  const { notes, createNote, settings, knownTags, notify } = useStore()
  const navigate = useNavigate()

  const [raw, setRaw] = useState(() => localStorage.getItem(DRAFT_KEY) || '')
  const [course, setCourse] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [structuring, setStructuring] = useState(false)
  const [showMeta, setShowMeta] = useState(false)

  // AI 整理后的预览
  const [preview, setPreview] = useState<{
    title: string
    course: string
    tags: string[]
    body: string
  } | null>(null)

  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, raw)
  }, [raw])

  // 自动撑高输入框
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`
  }, [raw, preview])

  const dueNotes = notes.filter((n) => isDue(n.review))
  const todayCount = notes.filter((n) => n.created.slice(0, 10) === dateStr()).length
  const recent = [...notes].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5)
  const tokenDaysLeft = settings.tokenExpiry
    ? Math.ceil((new Date(settings.tokenExpiry).getTime() - Date.now()) / 86_400_000)
    : null

  async function handleSave() {
    const body = (preview?.body ?? raw).trim()
    if (!body) {
      notify('先写点什么再存吧', 'info')
      return
    }
    setSaving(true)
    try {
      const title = preview?.title?.trim() || guessTitle(body)
      const note = await createNote({
        title,
        course: preview?.course ?? course,
        tags: preview?.tags ?? tags,
        body,
      })
      setRaw('')
      setPreview(null)
      setTags([])
      setCourse('')
      setShowMeta(false)
      localStorage.removeItem(DRAFT_KEY)
      notify('已存进知识库', 'ok')
      navigate(`/notes/${note.id}`)
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败，检查一下网络', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function handleStructure() {
    if (!raw.trim()) {
      notify('先把内容写进来，AI 才有东西整理', 'info')
      return
    }
    if (!settings.deepseekKey) {
      notify('还没有填 DeepSeek API Key，先去设置里填上', 'err')
      return
    }
    setStructuring(true)
    try {
      const s = await structureNote(settings.deepseekKey, settings.model, raw, { course, tags })
      setPreview({
        title: s.title || guessTitle(raw),
        course: s.course || course,
        tags: s.tags.length ? s.tags : tags,
        body: s.body,
      })
    } catch (e) {
      notify(e instanceof AIError ? e.message : 'AI 整理失败，再试一次', 'err')
    } finally {
      setStructuring(false)
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.18em] text-stone-400">
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 className="mt-1 font-serif text-[26px] font-semibold tracking-tight text-stone-900">
            {greeting()}
          </h1>
          <p className="mt-1 text-sm text-stone-500">想到什么先丢下来，剩下的交给复习和出题。</p>
        </div>
      </header>

      {settings.demo && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-xs leading-5 text-amber-900">
          演示模式：下面是样例知识点，改动只存在本机。{' '}
          <Link to="/settings" className="underline underline-offset-2">
            去配置自己的仓库
          </Link>
        </div>
      )}

      {tokenDaysLeft !== null && tokenDaysLeft <= 30 && (
        <Link
          to="/settings"
          className={`block rounded-2xl border px-4 py-2.5 text-xs leading-5 ${
            tokenDaysLeft <= 0
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-200 bg-amber-50/70 text-amber-900'
          }`}
        >
          {tokenDaysLeft <= 0
            ? 'GitHub Token 已经过期了，现在无法同步新笔记。'
            : `GitHub Token 还有 ${tokenDaysLeft} 天到期，过期后就没法同步了。`}
          点这里看怎么续期 →
        </Link>
      )}

      {/* 速记区 */}
      <section className="card overflow-hidden shadow-card">
        <div className="border-b border-stone-100 px-4 py-2.5">
          <span className="text-xs font-medium tracking-wide text-stone-400">快速记录</span>
        </div>

        {preview ? (
          <div className="space-y-4 p-4">
            <div>
              <label className="label">标题</label>
              <input
                className="input font-serif text-base"
                value={preview.title}
                onChange={(e) => setPreview({ ...preview, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">标签</label>
              <TagInput
                value={preview.tags}
                onChange={(t) => setPreview({ ...preview, tags: t })}
                suggestions={knownTags}
              />
            </div>
            <div>
              <label className="label">整理结果（可继续改）</label>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <Markdown text={preview.body} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Spinner /> : <Check className="h-4 w-4" />} 保存
              </button>
              <button className="btn-soft" onClick={() => setPreview(null)} disabled={saving}>
                回到原文
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <textarea
              ref={areaRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void handleSave()
                }
              }}
              placeholder="想到什么就写什么，不用管格式。比如：老师说 that 引导的同位语从句和定语从句，区别在于从句是否完整……"
              className="min-h-[104px] w-full resize-none border-0 bg-transparent text-[15px] leading-7 text-stone-800 outline-none placeholder:text-stone-400"
            />

            {showMeta && (
              <div className="mb-3 space-y-3 rounded-xl bg-stone-50/80 p-3">
                <div>
                  <label className="label">课程</label>
                  <input
                    className="input"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    placeholder="学术英语"
                  />
                </div>
                <div>
                  <label className="label">标签</label>
                  <TagInput value={tags} onChange={setTags} suggestions={knownTags} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
              <button
                className="btn-ghost text-xs"
                onClick={() => setShowMeta((v) => !v)}
                aria-expanded={showMeta}
              >
                {showMeta ? '收起课程/标签' : '＋ 课程 / 标签'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  className="btn-soft"
                  onClick={() => void handleStructure()}
                  disabled={structuring || !raw.trim()}
                  title="让 AI 把零散内容整理成结构化卡片"
                >
                  {structuring ? <Spinner /> : <Wand2 className="h-4 w-4" />}
                  AI 整理
                </button>
                <button
                  className="btn-primary"
                  onClick={() => void handleSave()}
                  disabled={saving || !raw.trim()}
                >
                  {saving ? <Spinner /> : <Sparkles className="h-4 w-4" />} 存下来
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-stone-300">⌘ + Enter 直接保存</p>
          </div>
        )}
      </section>

      {/* 待复习提示 */}
      {dueNotes.length > 0 && (
        <Link
          to="/review"
          className="group flex items-center justify-between rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3.5 transition hover:border-amber-300"
        >
          <div>
            <p className="text-sm font-medium text-amber-900">{dueNotes.length} 个知识点该复习了</p>
            <p className="mt-0.5 text-xs text-amber-700/80">花 5 分钟过一遍，比考前抱佛脚管用</p>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-700 transition group-hover:translate-x-0.5" />
        </Link>
      )}

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '全部知识点', value: notes.length },
          { label: '今日新增', value: todayCount },
          { label: '待复习', value: dueNotes.length },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <p className="font-serif text-xl font-semibold text-stone-900">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-stone-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 最近 */}
      <section>
        <SectionTitle
          right={
            <Link to="/notes" className="text-xs text-stone-400 hover:text-teal-700">
              全部 →
            </Link>
          }
        >
          最近记录
        </SectionTitle>
        {recent.length ? (
          <div className="space-y-2.5">
            {recent.map((n: Note) => (
              <NoteCard key={n.id} note={n} onClick={() => navigate(`/notes/${n.id}`)} />
            ))}
          </div>
        ) : (
          <Empty
            title="还没有任何知识点"
            hint="把课上听到的第一条内容丢进上面的框里，就开始了。"
          />
        )}
      </section>
    </div>
  )
}
