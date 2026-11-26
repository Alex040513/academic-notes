import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as gh from './github'
import { GitHubError, NetworkError, type RepoConfig } from './github'
import { makeNote, parseNote, serializeNote } from './frontmatter'
import { applyGrade } from './srs'
import { demoNotes } from './demo'
import {
  EMPTY_SETTINGS,
  hasRepo,
  type Grade,
  type Note,
  type QuizResult,
  type Settings,
} from './types'

const SETTINGS_KEY = 'aen.settings.v1'
const CACHE_KEY = 'aen.notes.v1'
const POPULAR_TAGS_KEY = 'aen.tags.v1'

type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' }

type StoreValue = {
  settings: Settings
  notes: Note[]
  ready: boolean
  syncing: boolean
  syncError: string | null
  lastSync: string | null
  configured: boolean
  toast: Toast | null
  saveSettings: (s: Settings) => void
  sync: () => Promise<void>
  createNote: (input: { title: string; course?: string; tags?: string[]; body: string }) => Promise<Note>
  updateNote: (
    note: Note,
    patch?: Partial<Pick<Note, 'title' | 'course' | 'tags' | 'body' | 'review'>>,
  ) => Promise<Note>
  deleteNote: (note: Note) => Promise<void>
  reviewNote: (note: Note, grade: Grade) => Promise<Note>
  markNotesStruggled: (ids: string[]) => Promise<void>
  saveQuizSession: (payload: {
    scope: string
    results: QuizResult[]
  }) => Promise<void>
  knownTags: string[]
  notify: (text: string, kind?: Toast['kind']) => void
  refreshFromCache: () => void
  enableDemo: () => void
  exitDemo: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return EMPTY_SETTINGS
    const s = { ...EMPTY_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
    // DeepSeek 已停用旧模型名，自动迁移到新模型并写回
    if (s.model && !['deepseek-flash', 'deepseek-v4-pro'].includes(s.model)) {
      s.model = 'deepseek-flash'
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
      } catch {
        /* ignore */
      }
    }
    return s
  } catch {
    return EMPTY_SETTINGS
  }
}

function readCache(): Note[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as Note[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeCache(notes: Note[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(notes))
  } catch {
    // 超出 localStorage 配额时忽略，内存里仍然可用
  }
}

function readTags(): string[] {
  try {
    return JSON.parse(localStorage.getItem(POPULAR_TAGS_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

function cfgOf(s: Settings): RepoConfig {
  return { token: s.token, owner: s.owner, repo: s.repo, branch: s.branch || 'main' }
}

function friendly(e: unknown): string {
  if (e instanceof gh.GitHubError || e instanceof NetworkError) return e.message
  if (e instanceof Error) return e.message
  return '操作失败，请重试'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [notes, setNotes] = useState<Note[]>(readCache)
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [knownTags, setKnownTags] = useState<string[]>(readTags)

  const inFlight = useRef(false)
  const toastTimer = useRef<number | undefined>(undefined)

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    setToast({ id: Date.now(), text, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4000)
  }, [])

  const configured = hasRepo(settings) || Boolean(settings.demo)
  /** 演示模式 / 未连接仓库：所有写操作只落本地缓存 */
  const localOnly = !hasRepo(settings)

  /* ---------------- 同步：只拉变化过的文件 ---------------- */
  const sync = useCallback(async () => {
    if (!hasRepo(settings) || inFlight.current) return
    inFlight.current = true
    setSyncing(true)
    setSyncError(null)
    try {
      const cfg = cfgOf(settings)
      const files = await gh.listNoteFiles(cfg)
      const cachedByPath = new Map(notes.map((n) => [n.path, n]))

      const changed = files.filter((f) => cachedByPath.get(f.path)?.sha !== f.sha)
      const fetched = await gh.mapLimit(changed, 5, async (f) => {
        const file = await gh.readText(cfg, f.path)
        if (!file) return null
        return parseNote(f.path, file.text, file.sha)
      })

      const byPath = new Map<string, Note>()
      for (const n of notes) byPath.set(n.path, n)
      for (const n of fetched) if (n) byPath.set(n.path, n)

      // 远端已删除的从本地移除；远端保留的保持原顺序无关，后面按更新时间排序
      const live = files.map((f) => byPath.get(f.path)).filter((n): n is Note => Boolean(n))
      setNotes(live)
      writeCache(live)
      setLastSync(new Date().toISOString())

      // 记下 Token 到期时间（GitHub 在每个响应头里都会给）
      const exp = gh.getTokenExpiry()
      if (exp) {
        setSettings((prev) => {
          if (prev.tokenExpiry === exp) return prev
          const next = { ...prev, tokenExpiry: exp }
          try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
          } catch {
            /* ignore */
          }
          return next
        })
      }
    } catch (e) {
      setSyncError(friendly(e))
    } finally {
      inFlight.current = false
      setSyncing(false)
      setReady(true)
    }
  }, [settings, notes])

  // 首次挂载：验证 Token 并同步一次
  useEffect(() => {
    let cancelled = false
    if (!hasRepo(settings)) {
      setReady(true)
      return
    }
    void (async () => {
      if (cancelled) return
      await sync()
    })()
    return () => {
      cancelled = true
    }
    // 只在 token / owner / repo / branch 变化时重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.token, settings.owner, settings.repo, settings.branch])

  // 记录出现过的标签，作为输入联想
  useEffect(() => {
    const set = new Set(knownTags)
    let changed = false
    for (const n of notes) {
      for (const t of n.tags) {
        if (!set.has(t)) {
          set.add(t)
          changed = true
        }
      }
    }
    if (changed) {
      const merged = Array.from(set).slice(0, 200)
      setKnownTags(merged)
      try {
        localStorage.setItem(POPULAR_TAGS_KEY, JSON.stringify(merged))
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  const saveSettings = useCallback((s: Settings) => {
    setSettings(s)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [])

  const refreshFromCache = useCallback(() => {
    setNotes(readCache())
  }, [])

  /** 载入样例数据，让用户不配置也能先体验 */
  const enableDemo = useCallback(() => {
    const demo = demoNotes()
    writeCache(demo)
    setNotes(demo)
    setReady(true)
    setSyncError(null)
    saveSettings({ ...EMPTY_SETTINGS, demo: true })
  }, [saveSettings])

  const exitDemo = useCallback(() => {
    localStorage.removeItem(CACHE_KEY)
    setNotes([])
    saveSettings({ ...EMPTY_SETTINGS, demo: false })
  }, [saveSettings])

  /* ---------------- 写入类操作 ---------------- */
  const createNote = useCallback(
    async (input: { title: string; course?: string; tags?: string[]; body: string }) => {
      const note = makeNote(input)

      if (localOnly) {
        const saved = { ...note }
        setNotes((prev) => {
          const next = [saved, ...prev]
          writeCache(next)
          return next
        })
        return saved
      }

      const cfg = cfgOf(settings)
      const sha = await gh.writeText(cfg, note.path, serializeNote(note), `新增：${note.title}`)
      const saved = { ...note, sha }
      setNotes((prev) => {
        const next = [saved, ...prev]
        writeCache(next)
        return next
      })
      return saved
    },
    [settings, localOnly],
  )

  const updateNote = useCallback(
    async (note: Note, patch: Partial<Pick<Note, 'title' | 'course' | 'tags' | 'body' | 'review'>> = {}) => {
      const merged: Note = { ...note, ...patch, updated: new Date().toISOString() }

      if (localOnly) {
        const saved = { ...merged }
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === saved.id ? saved : n))
          writeCache(next)
          return next
        })
        return saved
      }

      const cfg = cfgOf(settings)
      const sha = await gh.writeText(cfg, merged.path, serializeNote(merged), `更新：${merged.title}`, note.sha)
      const saved = { ...merged, sha }
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === saved.id ? saved : n))
        writeCache(next)
        return next
      })
      return saved
    },
    [settings, localOnly],
  )

  const deleteNote = useCallback(
    async (note: Note) => {
      if (localOnly) {
        setNotes((prev) => {
          const next = prev.filter((n) => n.path !== note.path)
          writeCache(next)
          return next
        })
        return
      }

      const cfg = cfgOf(settings)
      let sha = note.sha
      if (!sha) {
        const f = await gh.readText(cfg, note.path)
        if (!f) {
          setNotes((prev) => prev.filter((n) => n.path !== note.path))
          return
        }
        sha = f.sha
      }
      await gh.deleteText(cfg, note.path, sha, `删除：${note.title}`)
      setNotes((prev) => {
        const next = prev.filter((n) => n.path !== note.path)
        writeCache(next)
        return next
      })
    },
    [settings, localOnly],
  )

  const reviewNote = useCallback(
    async (note: Note, grade: Grade) => {
      const review = applyGrade(note.review, grade)
      const merged: Note = { ...note, review, updated: new Date().toISOString() }
      if (localOnly) {
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === note.id ? merged : n))
          writeCache(next)
          return next
        })
        return merged
      }
      try {
        const cfg = cfgOf(settings)
        const sha = await gh.writeText(cfg, merged.path, serializeNote(merged), `复习：${merged.title}`, note.sha)
        const saved = { ...merged, sha }
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === saved.id ? saved : n))
          writeCache(next)
          return next
        })
        return saved
      } catch (e) {
        // 写不进去也不要打断复习节奏：先更新本地，标记为待同步
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === note.id ? { ...merged, dirty: true } : n))
          writeCache(next)
          return next
        })
        notify(`复习记录没能存到云端：${friendly(e)}`, 'err')
        return merged
      }
    },
    [settings, notify],
  )

  /** 出题做错的知识点：缩短下次复习时间，让它们更快回到队列 */
  const markNotesStruggled = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      const targets = notes.filter((n) => ids.includes(n.id))
      for (const n of targets) {
        // reviewNote 走 'again'：间隔重置为 1 天、遗忘次数 +1，正是"做错了要尽快再看"
        await reviewNote(n, 'again')
      }
      notify(`已把 ${targets.length} 个做错的知识点提前排进复习`, 'ok')
    },
    [notes, reviewNote, notify],
  )

  const saveQuizSession = useCallback(
    async (payload: { scope: string; results: QuizResult[] }) => {
      if (!hasRepo(settings) || !payload.results.length) return
      const cfg = cfgOf(settings)
      const now = new Date()
      const correct = payload.results.filter((r) => r.correct).length
      const lines = [
        '---',
        `created: ${now.toISOString()}`,
        `total: ${payload.results.length}`,
        `correct: ${correct}`,
        `scope: ${payload.scope.replace(/"/g, "'")}`,
        '---',
        '',
        `# 出题记录 · ${now.toLocaleString('zh-CN')}`,
        '',
        `正确率 ${correct}/${payload.results.length}`,
        '',
      ]
      payload.results.forEach((r, i) => {
        lines.push(
          `## ${i + 1}. ${r.correct ? '✅' : '❌'} ${r.question.stem}`,
          '',
          `- 你的答案：${r.userAnswer || '（空）'}`,
          `- 参考答案：${r.question.answer}`,
          `- 讲解：${r.question.explanation}`,
          '',
        )
      })
      const path = `quizzes/${now.getTime()}.md`
      try {
        await gh.writeText(cfg, path, lines.join('\n'), `出题记录 ${now.toLocaleDateString('zh-CN')}`)
      } catch {
        // 存档失败不影响本次练习结果
      }
    },
    [settings],
  )

  const value = useMemo<StoreValue>(
    () => ({
      settings,
      notes,
      ready,
      syncing,
      syncError,
      lastSync,
      configured,
      toast,
      saveSettings,
      sync,
      createNote,
      updateNote,
      deleteNote,
      reviewNote,
      markNotesStruggled,
      saveQuizSession,
      knownTags,
      notify,
      refreshFromCache,
      enableDemo,
      exitDemo,
    }),
    [
      settings,
      notes,
      ready,
      syncing,
      syncError,
      lastSync,
      configured,
      toast,
      saveSettings,
      sync,
      createNote,
      updateNote,
      deleteNote,
      reviewNote,
      markNotesStruggled,
      saveQuizSession,
      knownTags,
      notify,
      refreshFromCache,
      enableDemo,
      exitDemo,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用')
  return ctx
}

export { GitHubError }
