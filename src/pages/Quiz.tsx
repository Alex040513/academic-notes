import { AlertTriangle, ArrowRight, Check, ChevronDown, RotateCcw, Sparkles, Wand2, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Spinner } from '../components/ui'
import { AIError, generateQuiz, gradeOpenAnswer } from '../lib/ai'
import { demoQuestions } from '../lib/demoQuiz'
import { useStore } from '../lib/store'
import { weakness } from '../lib/srs'
import {
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  type Note,
  type Question,
  type QuestionType,
  type QuizResult,
} from '../lib/types'

type Mode = 'all' | 'weak' | 'tag' | 'course' | 'note'

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[，。！？；：""''（）\[\].,!?;:"'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function Quiz() {
  const { notes, settings, saveQuizSession, markNotesStruggled, notify } = useStore()
  const location = useLocation()
  const presetNoteId = (location.state as { noteId?: string } | null)?.noteId

  const [phase, setPhase] = useState<'setup' | 'loading' | 'run' | 'done'>('setup')
  const [mode, setMode] = useState<Mode>(presetNoteId ? 'note' : 'all')
  const [tagValue, setTagValue] = useState('')
  const [courseValue, setCourseValue] = useState('')
  const [count, setCount] = useState(8)
  const [types, setTypes] = useState<QuestionType[]>(['choice', 'blank', 'correct'])

  const [questions, setQuestions] = useState<Question[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [verdict, setVerdict] = useState<boolean | null>(null)
  const [aiFeedback, setAiFeedback] = useState<string | null>(null)
  const [grading, setGrading] = useState(false)
  const [results, setResults] = useState<QuizResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [scopeLabel, setScopeLabel] = useState('')

  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30)
  }, [notes])

  const courses = useMemo(
    () => Array.from(new Set(notes.map((n) => n.course).filter(Boolean))).sort(),
    [notes],
  )

  const presetNote = notes.find((n) => n.id === presetNoteId)

  function pickScope(): { list: Note[]; label: string } {
    switch (mode) {
      case 'note': {
        const n = notes.find((x) => x.id === presetNoteId)
        return { list: n ? [n] : [], label: `单条笔记：${n?.title || ''}` }
      }
      case 'tag':
        return {
          list: notes.filter((n) => n.tags.includes(tagValue)),
          label: `标签：${tagValue}`,
        }
      case 'course':
        return {
          list: notes.filter((n) => n.course === courseValue),
          label: `课程：${courseValue}`,
        }
      case 'weak':
        return {
          list: [...notes].filter((n) => n.review.lapses > 0 || n.review.reps === 0),
          label: '薄弱知识点',
        }
      default:
        return { list: notes, label: '全部知识点' }
    }
  }

  function beginRun(qs: Question[], label: string) {
    setQuestions(qs)
    setIdx(0)
    setResults([])
    setInput('')
    setSubmitted(false)
    setVerdict(null)
    setAiFeedback(null)
    setScopeLabel(label)
    setPhase('run')
  }

  async function start() {
    if (!types.length) {
      setError('至少选一种题型。')
      return
    }

    // 演示模式且没配 Key 时，用内置题目把流程跑通
    const useDemo = Boolean(settings.demo && !settings.deepseekKey)
    if (!settings.deepseekKey && !useDemo) {
      setError('还没有填 DeepSeek API Key。去「设置」里填上，AI 才能出题。')
      return
    }

    const { list, label } = pickScope()
    if (!list.length) {
      setError('这个范围里没有知识点，换一个范围试试。')
      return
    }

    if (useDemo) {
      beginRun(demoQuestions(), '演示题目')
      return
    }

    // 优先挑薄弱的知识点，再打乱顺序；一次最多喂 12 条，避免 prompt 过长
    const ranked = [...list].sort((a, b) => weakness(b.review) - weakness(a.review)).slice(0, 12)
    const picked = shuffle(ranked)

    setError(null)
    setScopeLabel(label)
    setPhase('loading')
    try {
      const qs = await generateQuiz(settings.deepseekKey, settings.model, picked, { count, types })
      beginRun(qs, label)
    } catch (e) {
      setError(e instanceof AIError ? e.message : '出题失败，再试一次')
      setPhase('setup')
    }
  }

  const current = questions[idx]

  function submit() {
    if (!current) return
    if (!input.trim()) return
    setSubmitted(true)
    if (current.type === 'choice') {
      setVerdict(input === current.answer)
    } else if (current.type === 'blank') {
      setVerdict(norm(input) === norm(current.answer))
    } else {
      setVerdict(null)
    }
  }

  async function aiGrade() {
    if (!current || !settings.deepseekKey) return
    setGrading(true)
    try {
      const r = await gradeOpenAnswer(settings.deepseekKey, settings.model, current, input)
      setVerdict(r.verdict === 'correct')
      setAiFeedback(`${r.verdict === 'partial' ? '部分正确 · ' : ''}${r.feedback}`)
    } catch (e) {
      notify(e instanceof AIError ? e.message : 'AI 批改失败', 'err')
    } finally {
      setGrading(false)
    }
  }

  function next() {
    if (!current || verdict === null) return
    const result: QuizResult = {
      question: current,
      userAnswer: input,
      correct: verdict,
      selfGraded: current.type === 'correct' || current.type === 'translate',
    }
    const nextResults = [...results, result]
    setResults(nextResults)

    if (idx + 1 >= questions.length) {
      setPhase('done')
      void saveQuizSession({ scope: scopeLabel, results: nextResults })
    } else {
      setIdx(idx + 1)
      setInput('')
      setSubmitted(false)
      setVerdict(null)
      setAiFeedback(null)
    }
  }

  /* ------------------------------- 出题设置 ------------------------------- */
  if (phase === 'setup') {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-serif text-[24px] font-semibold tracking-tight text-stone-900">出题</h1>
          <p className="mt-1 text-sm text-stone-500">
            从你的笔记里出题，做完给讲解。做错的会自动提前回到复习队列。
          </p>
        </header>

        {notes.length === 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            还没有知识点，先去记几条再来出题。
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="card space-y-5 p-5">
          <div>
            <p className="label">出题范围</p>
            <div className="flex flex-wrap gap-1.5">
              <ModeChip active={mode === 'all'} onClick={() => setMode('all')}>
                全部知识点
              </ModeChip>
              <ModeChip active={mode === 'weak'} onClick={() => setMode('weak')}>
                薄弱知识点
              </ModeChip>
              {courses.length > 0 && (
                <ModeChip active={mode === 'course'} onClick={() => setMode('course')}>
                  按课程
                </ModeChip>
              )}
              {tags.length > 0 && (
                <ModeChip active={mode === 'tag'} onClick={() => setMode('tag')}>
                  按标签
                </ModeChip>
              )}
              {presetNote && (
                <ModeChip active={mode === 'note'} onClick={() => setMode('note')}>
                  只考这一张
                </ModeChip>
              )}
            </div>

            {mode === 'tag' && (
              <select value={tagValue} onChange={(e) => setTagValue(e.target.value)} className="input mt-3">
                <option value="">选一个标签…</option>
                {tags.map(([t, c]) => (
                  <option key={t} value={t}>
                    {t}（{c} 条）
                  </option>
                ))}
              </select>
            )}
            {mode === 'course' && (
              <select value={courseValue} onChange={(e) => setCourseValue(e.target.value)} className="input mt-3">
                <option value="">选一门课程…</option>
                {courses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            {mode === 'note' && presetNote && (
              <p className="mt-2.5 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
                只考：{presetNote.title}
              </p>
            )}
          </div>

          <div>
            <p className="label">题量</p>
            <div className="flex gap-1.5">
              {[5, 8, 10, 15].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`h-9 w-12 rounded-lg border text-sm transition ${
                    count === n
                      ? 'border-teal-700 bg-teal-700 text-white'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-teal-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label">题型</p>
            <div className="flex flex-wrap gap-1.5">
              {QUESTION_TYPES.map((t) => {
                const active = types.includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => setTypes(active ? types.filter((x) => x !== t) : [...types, t])}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      active
                        ? 'border-teal-700 bg-teal-50 text-teal-900'
                        : 'border-stone-200 bg-white text-stone-500 hover:border-teal-300'
                    }`}
                  >
                    {active && <Check className="mr-1 inline h-3 w-3" />}
                    {QUESTION_TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>

          <button className="btn-primary w-full py-3" onClick={() => void start()} disabled={!notes.length}>
            <Sparkles className="h-4 w-4" /> 开始出题
          </button>
        </section>

        <p className="text-center text-[11px] leading-5 text-stone-400">
          {settings.demo && !settings.deepseekKey ? (
            <>演示模式：这次会用 5 道内置示例题，让你先看看答题和讲解长什么样。配好 Key 之后，就是真正按你自己的笔记出题。</>
          ) : (
            <>
              出一次题大概花几厘钱。生成的题目会存一份到你的仓库 <span className="font-mono">quizzes/</span> 里，方便考前回看。
            </>
          )}
        </p>
      </div>
    )
  }

  /* ------------------------------- 生成中 ------------------------------- */
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
          <Wand2 className="h-6 w-6 animate-pulse" />
        </div>
        <p className="mt-5 font-serif text-lg text-stone-900">AI 正在读你的笔记出题</p>
        <p className="mt-1.5 text-sm text-stone-500">这个过程通常 10–25 秒，别关页面</p>
        <div className="mt-6 h-1 w-40 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full w-1/3 animate-[loading_1.4s_ease-in-out_infinite] rounded-full bg-teal-700" />
        </div>
        <style>{`@keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}`}</style>
      </div>
    )
  }

  /* ------------------------------- 答题中 ------------------------------- */
  if (phase === 'run' && current) {
    const isChoice = current.type === 'choice'
    const isObjective = current.type === 'choice' || current.type === 'blank'
    const progress = Math.round((idx / questions.length) * 100)

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>
            第 {idx + 1} / {questions.length} 题
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
            {QUESTION_TYPE_LABEL[current.type]}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="card p-5">
          <p className="whitespace-pre-wrap font-serif text-[17px] leading-8 text-stone-900">{current.stem}</p>

          <div className="mt-5 space-y-2">
            {isChoice &&
              current.options?.map((opt, i) => {
                const selected = input === opt
                const showState = submitted
                const isRight = showState && opt === current.answer
                const isWrongPick = showState && selected && opt !== current.answer
                return (
                  <button
                    key={opt}
                    disabled={submitted}
                    onClick={() => setInput(opt)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-sm leading-6 transition ${
                      isRight
                        ? 'border-teal-500 bg-teal-50 text-teal-900'
                        : isWrongPick
                          ? 'border-red-400 bg-red-50 text-red-900'
                          : selected
                            ? 'border-teal-600 bg-teal-50/60 text-stone-900'
                            : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                    } ${submitted ? 'cursor-default' : ''}`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                        isRight
                          ? 'bg-teal-600 text-white'
                          : isWrongPick
                            ? 'bg-red-500 text-white'
                            : selected
                              ? 'bg-teal-700 text-white'
                              : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{opt}</span>
                  </button>
                )
              })}

            {current.type === 'blank' && (
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={submitted}
                placeholder="填入缺失的部分"
                className="input text-base"
                autoFocus
              />
            )}

            {(current.type === 'correct' || current.type === 'translate') && (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={submitted}
                rows={3}
                placeholder={current.type === 'correct' ? '写出改正后的完整句子' : '写出你的英文译文'}
                className="input resize-none text-base leading-7"
                autoFocus
              />
            )}
          </div>

          {!submitted && (
            <button className="btn-primary mt-5 w-full py-3" onClick={submit} disabled={!input.trim()}>
              提交
            </button>
          )}
        </div>

        {submitted && (
          <section className="card space-y-4 p-5">
            {isObjective ? (
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    verdict ? 'bg-teal-600 text-white' : 'bg-red-500 text-white'
                  }`}
                >
                  {verdict ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </span>
                <p className={`text-sm font-medium ${verdict ? 'text-teal-800' : 'text-red-700'}`}>
                  {verdict ? '答对了' : '答错了'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-stone-600">
                  <span className="font-medium text-stone-800">参考答案：</span>
                  {current.answer}
                </p>
                {aiFeedback && (
                  <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs leading-6 text-stone-600">
                    AI 批改：{aiFeedback}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-stone-400">你写对了吗？</span>
                  <button
                    onClick={() => setVerdict(true)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      verdict === true
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-stone-200 text-stone-600'
                    }`}
                  >
                    答对了
                  </button>
                  <button
                    onClick={() => setVerdict(false)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      verdict === false
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : 'border-stone-200 text-stone-600'
                    }`}
                  >
                    没答对
                  </button>
                  {settings.deepseekKey && (
                    <button className="btn-ghost text-xs" onClick={() => void aiGrade()} disabled={grading}>
                      {grading ? <Spinner className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />} AI 批改
                    </button>
                  )}
                </div>
              </div>
            )}

            {!isObjective && (
              <p className="text-xs leading-6 text-stone-400">
                主观题按下你自己的判断记分；拿不准可以点「AI 批改」。
              </p>
            )}

            <div className="rounded-xl bg-stone-50/80 px-4 py-3">
              <p className="mb-1 text-[11px] uppercase tracking-wider text-stone-400">讲解</p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-7 text-stone-700">{current.explanation}</p>
            </div>

            {current.sourceTitle && (
              <p className="text-[11px] text-stone-400">考点来自：{current.sourceTitle}</p>
            )}

            <button className="btn-primary w-full py-3" onClick={next} disabled={verdict === null}>
              {idx + 1 >= questions.length ? '看结果' : '下一题'} <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        )}
      </div>
    )
  }

  /* ------------------------------- 结果 ------------------------------- */
  const correctCount = results.filter((r) => r.correct).length
  const rate = results.length ? Math.round((correctCount / results.length) * 100) : 0
  const wrongIds = Array.from(
    new Set(results.filter((r) => !r.correct).map((r) => r.question.sourceId).filter(Boolean) as string[]),
  )

  return (
    <div className="space-y-6">
      <div className="card p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">本次成绩</p>
        <p className="mt-2 font-serif text-5xl font-semibold text-stone-900">
          {correctCount}
          <span className="text-2xl text-stone-300"> / {results.length}</span>
        </p>
        <p className="mt-1.5 text-sm text-stone-500">
          {rate >= 90
            ? '很稳，这套知识点你已经拿下了'
            : rate >= 70
              ? '基本掌握，把错的几条再顺一遍就差不多了'
              : rate >= 40
                ? '还有明显的漏洞，建议把错题送回复习队列'
                : '这块还很生，明天再看一轮会更有效'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {wrongIds.length > 0 && (
            <button className="btn-soft" onClick={() => void markNotesStruggled(wrongIds)}>
              <RotateCcw className="h-4 w-4" /> 把 {wrongIds.length} 个错题知识点提前复习
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => {
              setPhase('setup')
              setResults([])
              setQuestions([])
            }}
          >
            再来一套
          </button>
        </div>
      </div>

      <section className="space-y-2.5">
        {results.map((r, i) => (
          <details key={i} className="group card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                  r.correct ? 'bg-teal-600' : 'bg-red-500'
                }`}
              >
                {r.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 text-left text-[13.5px] leading-6 text-stone-700">{r.question.stem}</span>
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-stone-400 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-stone-100 px-4 py-3 text-[13px] leading-6">
              <p className="text-stone-600">
                <span className="text-stone-400">你的答案：</span>
                {r.userAnswer || '（空）'}
              </p>
              <p className="text-stone-600">
                <span className="text-stone-400">参考答案：</span>
                {r.question.answer}
              </p>
              <p className="whitespace-pre-wrap text-stone-600">
                <span className="text-stone-400">讲解：</span>
                {r.question.explanation}
              </p>
            </div>
          </details>
        ))}
      </section>

      <div className="text-center">
        <Link to="/" className="btn-ghost text-sm">
          回今日
        </Link>
      </div>
    </div>
  )
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? 'border-teal-700 bg-teal-50 text-teal-900'
          : 'border-stone-200 bg-white text-stone-500 hover:border-teal-300'
      }`}
    >
      {children}
    </button>
  )
}
