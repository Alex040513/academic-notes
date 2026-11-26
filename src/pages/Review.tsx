import { ArrowRight, Check, Repeat } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { Empty } from '../components/ui'
import { useStore } from '../lib/store'
import { dueLabel, isDue } from '../lib/srs'
import type { Grade, Note } from '../lib/types'

type Phase = 'idle' | 'running' | 'done'

const GRADE_BUTTONS: { grade: Grade; label: string; hint: string; cls: string }[] = [
  { grade: 'again', label: '忘了', hint: '1', cls: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' },
  { grade: 'hard', label: '有点模糊', hint: '2', cls: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' },
  { grade: 'good', label: '记得', hint: '3', cls: 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100' },
]

export function Review() {
  const { notes, reviewNote } = useStore()
  const [phase, setPhase] = useState<Phase>('idle')
  const [queue, setQueue] = useState<Note[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [againCount, setAgainCount] = useState(0)

  const due = useMemo(() => notes.filter((n) => isDue(n.review)), [notes])

  const start = useCallback(
    (limit?: number) => {
      const sorted = [...notes]
        .filter((n) => isDue(n.review))
        .sort((a, b) => a.review.due.localeCompare(b.review.due) || b.review.lapses - a.review.lapses)
      const list = limit ? sorted.slice(0, limit) : sorted
      setQueue(list)
      setIndex(0)
      setRevealed(false)
      setAgainCount(0)
      setPhase(list.length ? 'running' : 'done')
    },
    [notes],
  )

  const current = queue[index]

  const grade = useCallback(
    (g: Grade) => {
      if (!current) return
      void reviewNote(current, g)
      if (g === 'again') setAgainCount((c) => c + 1)
      if (index + 1 >= queue.length) {
        setPhase('done')
      } else {
        setIndex((i) => i + 1)
        setRevealed(false)
      }
    },
    [current, index, queue.length, reviewNote],
  )

  // 键盘操作：空格显示答案，1/2/3 评价
  useEffect(() => {
    if (phase !== 'running') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !revealed) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3'].includes(e.key)) {
        const map: Record<string, Grade> = { '1': 'again', '2': 'hard', '3': 'good' }
        grade(map[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, revealed, grade])

  if (phase === 'idle') {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-serif text-[24px] font-semibold tracking-tight text-stone-900">复习</h1>
          <p className="mt-1 text-sm text-stone-500">
            按遗忘曲线排队，到期的先出现。今天到期 {due.length} 个。
          </p>
        </header>

        {due.length ? (
          <div className="card p-6">
            <p className="font-serif text-lg text-stone-900">该复习的都在这里了</p>
            <p className="mt-1 text-sm text-stone-500">
              共 {due.length} 个知识点。全部过一遍大约需要 {Math.max(1, Math.round(due.length * 0.5))} 分钟。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => start()}>
                开始复习 <ArrowRight className="h-4 w-4" />
              </button>
              {due.length > 10 && (
                <button className="btn-soft" onClick={() => start(10)}>
                  先过 10 个
                </button>
              )}
            </div>
          </div>
        ) : (
          <Empty
            icon={<Check className="h-7 w-7" />}
            title="今天没有到期的知识点"
            hint={
              notes.length
                ? '都复习完了。可以等明天，或者去知识库挑几条手动安排复习。'
                : '先去记几个知识点，之后它们会自动排进复习队列。'
            }
            action={
              <Link to="/notes" className="btn-soft">
                去知识库
              </Link>
            }
          />
        )}

        <div className="card px-4 py-3.5">
          <p className="text-xs leading-6 text-stone-500">
            <span className="font-medium text-stone-700">怎么用：</span>
            先看标题回忆，想不起来再显示答案。诚实点评价自己 —— 「忘了」的卡片明天就会再来，「记得」的会隔得越来越久。
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="space-y-6 py-6">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <Check className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-serif text-xl font-semibold text-stone-900">这一轮复习完了</h2>
          <p className="mt-2 text-sm text-stone-500">
            过了 {queue.length} 个知识点{againCount > 0 ? `，其中 ${againCount} 个没想起来，明天会再来找你` : '，全记得，很稳'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/" className="btn-primary">
              回今日
            </Link>
            {due.length > 0 && (
              <button className="btn-soft" onClick={() => start()}>
                <Repeat className="h-4 w-4" /> 再来一轮
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!current) return null

  const progress = Math.round((index / queue.length) * 100)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-xs text-stone-400">
        <span>
          {index + 1} / {queue.length}
        </span>
        <button onClick={() => setPhase('done')} className="hover:text-stone-700">
          结束这轮
        </button>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="card px-5 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          {current.course && <span className="chip">{current.course}</span>}
          {current.tags.map((t) => (
            <span key={t} className="chip border-transparent bg-stone-50 text-stone-500">
              #{t}
            </span>
          ))}
        </div>

        <h2 className="font-serif text-[22px] font-semibold leading-snug text-stone-900">{current.title}</h2>

        {revealed ? (
          <div className="mt-5 border-t border-stone-100 pt-5">
            <Markdown text={current.body} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-400">先在脑子里讲一遍：这条规则是什么？能不能举一个例子？</p>
        )}
      </div>

      {revealed ? (
        <div className="sticky bottom-20 z-10 space-y-2 rounded-2xl bg-paper/95 py-2 backdrop-blur md:bottom-4">
          <p className="text-center text-xs text-stone-400">刚才回忆得怎么样？</p>
          <div className="grid grid-cols-3 gap-2">
            {GRADE_BUTTONS.map((b) => (
              <button
                key={b.grade}
                onClick={() => grade(b.grade)}
                className={`rounded-xl border py-3 text-sm font-medium transition active:scale-[0.98] ${b.cls}`}
              >
                {b.label}
                <span className="mt-0.5 block text-[10px] font-normal opacity-50">按 {b.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button className="btn-primary w-full py-3" onClick={() => setRevealed(true)}>
          显示答案 <span className="text-xs opacity-60">空格</span>
        </button>
      )}

      <p className="text-center text-[11px] text-stone-300">到期：{dueLabel(current.review.due)}</p>
    </div>
  )
}
