import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Plug,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Spinner } from '../components/ui'
import { testAI, AIError } from '../lib/ai'
import { createRepo, getRepo, getViewer } from '../lib/github'
import { useStore } from '../lib/store'
import { EMPTY_SETTINGS, hasRepo, type Settings as SettingsType } from '../lib/types'

type Status = { kind: 'ok' | 'err' | 'info'; text: string } | null

export function Settings() {
  const { settings, saveSettings, sync, notes, notify, configured, lastSync, enableDemo, exitDemo } = useStore()
  const [form, setForm] = useState<SettingsType>(settings)
  const [showToken, setShowToken] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [testingAI, setTestingAI] = useState(false)
  const [aiStatus, setAiStatus] = useState<Status>(null)

  const repoUrl = configured ? `https://github.com/${settings.owner}/${settings.repo}` : ''
  const stats = useMemo(() => {
    const tags = new Set<string>()
    for (const n of notes) for (const t of n.tags) tags.add(t)
    return { count: notes.length, tags: tags.size, courses: new Set(notes.map((n) => n.course).filter(Boolean)).size }
  }, [notes])

  async function handleConnect() {
    const token = form.token.trim()
    const repo = form.repo.trim()
    if (!token) {
      setStatus({ kind: 'err', text: '先填 GitHub Token' })
      return
    }
    if (!repo) {
      setStatus({ kind: 'err', text: '填一个仓库名，比如 academic-english-notes-data' })
      return
    }

    setConnecting(true)
    setStatus({ kind: 'info', text: '正在验证 Token…' })
    try {
      const viewer = await getViewer({ token, owner: '', repo, branch: form.branch })
      let owner = form.owner.trim() || viewer.login

      const base = { token, owner, repo, branch: form.branch || 'main' }
      let info = await getRepo(base)

      if (!info) {
        setStatus({ kind: 'info', text: `找不到 ${owner}/${repo}，正在尝试自动创建私有仓库…` })
        try {
          await createRepo(base)
          info = await getRepo(base)
        } catch {
          throw new Error(
            `找不到仓库 ${owner}/${repo}，也没能自动创建。请先去 GitHub 手动新建一个 Private 仓库，再回来点连接。`,
          )
        }
      }

      if (!info) throw new Error('仓库创建后仍读不到，稍等几秒再点一次连接。')

      // 以仓库真实默认分支为准，避免 main / master 不一致导致写入失败
      const branch = info.default_branch || form.branch || 'main'
      const next = { ...form, token, owner, repo, branch }
      setForm(next)
      saveSettings(next)
      setStatus({
        kind: 'ok',
        text: `连接成功：${owner}/${repo}（分支 ${branch}）${info.private ? '' : '——注意：这是公开仓库！'}`,
      })
      if (!info.private) notify('这个仓库是公开的，别人能看到你的笔记，建议改成 Private', 'err')
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof Error ? e.message : '连接失败' })
    } finally {
      setConnecting(false)
    }
  }

  async function handleTestAI() {
    if (!form.deepseekKey.trim()) {
      setAiStatus({ kind: 'err', text: '先填 DeepSeek API Key' })
      return
    }
    setTestingAI(true)
    setAiStatus({ kind: 'info', text: '正在测试…' })
    try {
      await testAI(form.deepseekKey.trim(), form.model)
      saveSettings({ ...settings, deepseekKey: form.deepseekKey.trim(), model: form.model })
      setAiStatus({ kind: 'ok', text: 'AI 可用，出题和整理笔记都能用了' })
    } catch (e) {
      setAiStatus({ kind: 'err', text: e instanceof AIError ? e.message : 'AI 测试失败' })
    } finally {
      setTestingAI(false)
    }
  }

  function handleExport() {
    const header = `# 学术英语知识点导出\n\n导出时间：${new Date().toLocaleString('zh-CN')}\n共 ${notes.length} 条\n\n---\n\n`
    const body = notes
      .map(
        (n) =>
          `## ${n.title}\n\n${[n.course, ...n.tags.map((t) => `#${t}`)].filter(Boolean).join(' · ')}\n\n${n.body}\n\n---\n`,
      )
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notes-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
    notify('已导出 Markdown 文件', 'ok')
  }

  function handleDisconnect() {
    if (!window.confirm('断开后会清空这台设备上的本地缓存（云端笔记不受影响），确定吗？')) return
    localStorage.removeItem('aen.notes.v1')
    saveSettings(EMPTY_SETTINGS)
    setForm(EMPTY_SETTINGS)
    setStatus(null)
    notify('已断开，可随时重新连接', 'info')
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight text-stone-900">
          {configured ? '设置' : '先花两分钟配置一下'}
        </h1>
        <p className="mt-1 text-sm leading-6 text-stone-500">
          {configured
            ? '笔记存在你自己的 GitHub 私有仓库里，AI 用你自己的 DeepSeek Key。'
            : '这个应用不需要注册，也没有服务器。你只需要一个 GitHub 账号（存笔记）和一个 DeepSeek Key（AI 出题）。'}
        </p>
      </header>

      {settings.demo && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-900">
          <b>演示模式</b>：现在看到的是 6 条样例知识点，你的改动只保存在这台设备上，不会同步到云端。
          <button onClick={exitDemo} className="ml-1 underline underline-offset-2">
            退出演示
          </button>
        </div>
      )}

      {!configured && (
        <div className="card p-5">
          <p className="font-serif text-[15px] text-stone-900">想先看看里面长什么样？</p>
          <p className="mt-1 text-xs leading-6 text-stone-500">
            载入几条样例知识点，把速记、复习、出题都点一遍，确定合用了再去配置 GitHub。
          </p>
          <button className="btn-soft mt-3" onClick={enableDemo}>
            载入演示数据看看
          </button>
        </div>
      )}

      {/* --------------- 仓库 --------------- */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-stone-400" />
            <h2 className="text-sm font-medium text-stone-800">笔记仓库</h2>
          </div>
          {hasRepo(settings) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] text-teal-800">
              <Check className="h-3 w-3" /> 已连接
            </span>
          )}
        </div>

        <div className="space-y-4 px-5 py-4">
          {hasRepo(settings) && (
            <div className="rounded-xl bg-stone-50 px-3.5 py-2.5 text-xs leading-6 text-stone-600">
              <p className="font-mono text-[11px] text-stone-700">
                {settings.owner}/{settings.repo}@{settings.branch}
              </p>
              <p className="mt-0.5 text-stone-400">
                共 {stats.count} 条笔记 · {stats.tags} 个标签
                {lastSync && ` · 上次同步 ${new Date(lastSync).toLocaleString('zh-CN')}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                >
                  打开仓库 <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={() => void sync()} className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-800">
                  立即同步
                </button>
              </div>
            </div>
          )}

          <details className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-xs leading-6 text-stone-600">
            <summary className="cursor-pointer list-none font-medium text-stone-700">
              第一次用？点这里看怎么拿到 Token（约 1 分钟）
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4">
              <li>
                打开{' '}
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-700 underline"
                >
                  GitHub 令牌创建页
                </a>
                （Fine-grained token）
              </li>
              <li>
                <b>Repository access</b> 选 <b>All repositories</b>（这样应用能自动帮你建仓库）；只想手动建仓库的话选 Only select repositories 也可以
              </li>
              <li>
                <b>Permissions → Repository permissions</b>：把 <b>Contents</b> 设为 Read and write；想让它自动建仓库，再把 <b>Administration</b> 设为 Read and write
              </li>
              <li>点 Generate token，复制生成的串（只显示一次）</li>
              <li>回到这里粘进下面的框，仓库名随便起，点「连接」即可</li>
            </ol>
          </details>

          <div>
            <label className="label">GitHub Token</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                placeholder="github_pat_… 或 ghp_…"
                className="input pr-16 font-mono text-[13px]"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                {showToken ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">用户名（留空自动填）</label>
              <input
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                placeholder="自动获取"
                className="input font-mono text-[13px]"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label">仓库名</label>
              <input
                value={form.repo}
                onChange={(e) => setForm({ ...form, repo: e.target.value })}
                placeholder="academic-english-notes-data"
                className="input font-mono text-[13px]"
              />
            </div>
            <div>
              <label className="label">分支</label>
              <input
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                placeholder="main"
                className="input font-mono text-[13px]"
              />
            </div>
          </div>

          {status && (
            <p
              className={`rounded-xl px-3.5 py-2.5 text-xs leading-6 ${
                status.kind === 'ok'
                  ? 'bg-teal-50 text-teal-800'
                  : status.kind === 'err'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-stone-50 text-stone-600'
              }`}
            >
              {status.text}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => void handleConnect()} disabled={connecting}>
              {connecting ? <Spinner /> : <Plug className="h-4 w-4" />}
              {hasRepo(settings) ? '重新连接' : '连接'}
            </button>
            {hasRepo(settings) && (
              <button className="btn-ghost text-stone-500" onClick={handleDisconnect}>
                <LogOut className="h-4 w-4" /> 断开
              </button>
            )}
          </div>
        </div>
      </section>

      {/* --------------- AI --------------- */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-stone-400" />
            <h2 className="text-sm font-medium text-stone-800">AI（DeepSeek）</h2>
          </div>
          {settings.deepseekKey && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] text-teal-800">
              <Check className="h-3 w-3" /> 已填
            </span>
          )}
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs leading-6 text-stone-500">
            用来把零散笔记整理成卡片、按知识点出题、批改主观题。Key 只保存在你这台设备的浏览器里，不会发到除 DeepSeek 之外的任何地方。
          </p>

          <div>
            <label className="label">API Key</label>
            <input
              type="password"
              value={form.deepseekKey}
              onChange={(e) => setForm({ ...form, deepseekKey: e.target.value })}
              placeholder="sk-…"
              className="input font-mono text-[13px]"
              autoComplete="off"
            />
            <p className="mt-1.5 text-[11px] text-stone-400">
              还没有？去{' '}
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 hover:underline"
              >
                platform.deepseek.com
              </a>{' '}
              申请，充 10 元能用很久（一次出题约几分钱）。
            </p>
          </div>

          <div>
            <label className="label">模型</label>
            <select
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="input text-sm"
            >
              <option value="deepseek-chat">deepseek-chat（快，够用）</option>
              <option value="deepseek-reasoner">deepseek-reasoner（更会讲道理，稍慢）</option>
            </select>
          </div>

          {aiStatus && (
            <p
              className={`rounded-xl px-3.5 py-2.5 text-xs leading-6 ${
                aiStatus.kind === 'ok'
                  ? 'bg-teal-50 text-teal-800'
                  : aiStatus.kind === 'err'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-stone-50 text-stone-600'
              }`}
            >
              {aiStatus.text}
            </p>
          )}

          <button className="btn-primary" onClick={() => void handleTestAI()} disabled={testingAI}>
            {testingAI ? <Spinner /> : <KeyRound className="h-4 w-4" />} 测试 AI
          </button>
        </div>
      </section>

      {/* --------------- 数据 --------------- */}
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-3">
          <Download className="h-4 w-4 text-stone-400" />
          <h2 className="text-sm font-medium text-stone-800">数据</h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: '知识点', value: stats.count },
              { label: '标签', value: stats.tags },
              { label: '课程', value: stats.courses },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-stone-50 py-2.5">
                <p className="font-serif text-lg text-stone-900">{s.value}</p>
                <p className="text-[11px] text-stone-400">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={handleExport} disabled={!notes.length}>
              <Download className="h-4 w-4" /> 导出为 Markdown
            </button>
            <button
              className="btn-ghost text-stone-500"
              onClick={() => {
                if (!window.confirm('只清空这台设备上的缓存，云端仓库不受影响。继续？')) return
                localStorage.removeItem('aen.notes.v1')
                location.reload()
              }}
            >
              <Trash2 className="h-4 w-4" /> 清空本地缓存
            </button>
          </div>

          <p className="text-[11px] leading-5 text-stone-400">
            每一条笔记就是仓库里的一个 .md 文件（<span className="font-mono">notes/</span> 目录），
            用任何编辑器都能打开。哪天不用这个网页了，笔记也还好好地在你的 GitHub 里。
          </p>
        </div>
      </section>

      {!hasRepo(settings) && (
        <p className="pb-4 text-center text-[11px] leading-5 text-stone-400">
          <Copy className="mr-1 inline h-3 w-3" />
          建议把这个网页加到手机主屏幕：Safari 点「分享 → 添加到主屏幕」，Android Chrome 点菜单里的「安装应用」。
        </p>
      )}
      {connecting && (
        <p className="flex items-center justify-center gap-2 text-xs text-stone-400">
          <Loader2 className="h-3 w-3 animate-spin" /> 正在连接 GitHub…
        </p>
      )}
    </div>
  )
}
