import type { Settings } from './types'

const API = 'https://api.github.com'

/**
 * GitHub 在每次响应里都会带上 Token 的到期时间：
 *   github-authentication-token-expiration: 2027-02-24 17:00:00 UTC
 * 顺手记下来，用来在界面里提醒续期。
 */
let tokenExpiry: string | null = null

export function getTokenExpiry(): string | null {
  return tokenExpiry
}

function normalizeExpiry(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : v
}

export type RepoConfig = Pick<Settings, 'token' | 'owner' | 'repo' | 'branch'>

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

export class NetworkError extends Error {
  constructor(message = '网络连接失败，请检查是否联网') {
    super(message)
    this.name = 'NetworkError'
  }
}

function friendlyError(status: number, raw: string, rateLeft: string | null): string {
  if (status === 401) return 'GitHub Token 无效或已过期，请到设置里重新填一个'
  if (status === 404) return '找不到这个仓库，检查「用户名 / 仓库名」是否写对，或 Token 没有该仓库的权限'
  if (status === 403) {
    if (rateLeft === '0') return 'GitHub 请求次数超限了，等一小时再试'
    return 'Token 权限不足，需要该仓库的 Contents 读写权限'
  }
  if (status === 409) return '仓库里这份内容已被改动，刷新后再保存'
  if (status === 422) return `GitHub 拒绝了这次请求${raw ? `：${raw}` : ''}`
  if (status >= 500) return 'GitHub 服务器开小差了，稍后重试'
  return raw || `请求失败（${status}）`
}

async function api<T>(cfg: RepoConfig, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...((init.headers as Record<string, string>) || {}),
      },
    })
  } catch {
    throw new NetworkError()
  }

  if (!res.ok) {
    let msg = ''
    try {
      const j = (await res.json()) as { message?: string }
      msg = j?.message || ''
    } catch {
      /* ignore */
    }
    throw new GitHubError(res.status, friendlyError(res.status, msg, res.headers.get('x-ratelimit-remaining')))
  }

  if (res.status === 204) return undefined as T

  const exp = res.headers.get('github-authentication-token-expiration')
  if (exp) tokenExpiry = normalizeExpiry(exp)

  return (await res.json()) as T
}

function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const repoPath = (cfg: RepoConfig) => `/repos/${cfg.owner}/${cfg.repo}`

export async function getViewer(cfg: RepoConfig): Promise<{ login: string }> {
  return api<{ login: string }>(cfg, '/user')
}

export async function getRepo(
  cfg: RepoConfig,
): Promise<{ private: boolean; default_branch: string } | null> {
  try {
    const r = await api<{ private: boolean; default_branch: string }>(cfg, repoPath(cfg))
    return { private: r.private, default_branch: r.default_branch }
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null
    throw e
  }
}

/** 仓库不存在时尝试自动创建（需要 Token 有创建仓库的权限） */
export async function createRepo(cfg: RepoConfig): Promise<void> {
  await api(cfg, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: cfg.repo,
      private: true,
      auto_init: true,
      description: '学术英语知识点笔记（由笔记应用自动创建）',
    }),
  })
}

export type FileEntry = { path: string; sha: string }

/** 列出 notes/ 下所有 md 文件；目录不存在时返回空数组 */
export async function listNoteFiles(cfg: RepoConfig): Promise<FileEntry[]> {
  try {
    const items = await api<{ path: string; sha: string; name: string; type: string }[]>(
      cfg,
      `${repoPath(cfg)}/contents/notes?ref=${encodeURIComponent(cfg.branch)}`,
    )
    if (!Array.isArray(items)) return []
    return items.filter((i) => i.type === 'file' && i.name.endsWith('.md')).map((i) => ({ path: i.path, sha: i.sha }))
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return []
    throw e
  }
}

/** 读取一个文本文件，不存在返回 null */
export async function readText(cfg: RepoConfig, path: string): Promise<{ text: string; sha: string } | null> {
  try {
    const f = await api<{ content?: string; encoding?: string; sha: string; download_url?: string }>(
      cfg,
      `${repoPath(cfg)}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`,
    )
    if (f.content && f.encoding === 'base64') {
      return { text: b64decode(f.content), sha: f.sha }
    }
    // 文件较大时 GitHub 不给 content，走 download_url
    if (f.download_url) {
      const res = await fetch(f.download_url, {
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.raw' },
      })
      if (!res.ok) throw new GitHubError(res.status, '读取文件内容失败')
      return { text: await res.text(), sha: f.sha }
    }
    return { text: '', sha: f.sha }
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null
    throw e
  }
}

export async function writeText(
  cfg: RepoConfig,
  path: string,
  text: string,
  message: string,
  sha?: string,
): Promise<string> {
  const res = await api<{ content: { sha: string } }>(cfg, `${repoPath(cfg)}/contents/${encodePath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: b64encode(text),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  })
  return res.content.sha
}

export async function deleteText(cfg: RepoConfig, path: string, sha: string, message: string): Promise<void> {
  await api(cfg, `${repoPath(cfg)}/contents/${encodePath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: cfg.branch }),
  })
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** 限制并发地跑一批异步任务，避免一次性打 100 个请求 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}
