import {
  BookOpen,
  CloudOff,
  ListChecks,
  PenLine,
  RefreshCw,
  Repeat,
  Settings as SettingsIcon,
  Wifi,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../lib/store'
import { isDue } from '../lib/srs'
import { Spinner } from './ui'

const NAV = [
  { to: '/', label: '今日', icon: PenLine, end: true },
  { to: '/notes', label: '知识库', icon: BookOpen },
  { to: '/review', label: '复习', icon: Repeat },
  { to: '/quiz', label: '出题', icon: ListChecks },
  { to: '/settings', label: '设置', icon: SettingsIcon },
]

const TITLES: Record<string, string> = {
  '/': '今日',
  '/notes': '知识库',
  '/review': '复习',
  '/quiz': '出题',
  '/settings': '设置',
}

function SyncBadge() {
  const { syncing, syncError, lastSync, configured, settings, sync } = useStore()
  if (!configured) return null

  if (settings.demo) {
    return <span className="text-xs text-amber-700">演示模式</span>
  }
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
        <Spinner className="h-3 w-3" /> 同步中
      </span>
    )
  }
  if (syncError) {
    return (
      <button
        onClick={() => void sync()}
        className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:underline"
        title={syncError}
      >
        <CloudOff className="h-3.5 w-3.5" /> 同步失败，重试
      </button>
    )
  }
  return (
    <button
      onClick={() => void sync()}
      className="inline-flex items-center gap-1.5 text-xs text-stone-400 transition hover:text-stone-700"
      title="点一下从云端拉取最新内容"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {lastSync ? `已同步 ${new Date(lastSync).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '同步'}
    </button>
  )
}

export function Shell() {
  const { notes, toast, configured } = useStore()
  const location = useLocation()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const dueCount = notes.filter((n) => isDue(n.review)).length

  // 没配置仓库时先把用户带到设置页
  if (!configured && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />
  }

  const pageTitle = TITLES[location.pathname] || '笔记'

  return (
    <div className="min-h-screen md:flex">
      {/* 桌面端侧边栏 */}
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-stone-200/70 bg-white/50 px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-800 font-serif text-sm text-white">
            英
          </span>
          <div className="leading-tight">
            <p className="font-serif text-[15px] font-semibold text-stone-900">学问</p>
            <p className="text-[11px] text-stone-400">知识卡片</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive
                    ? 'bg-teal-50 font-medium text-teal-900'
                    : 'text-stone-500 hover:bg-stone-100/80 hover:text-stone-800'
                }`
              }
            >
              <Icon className="h-4 w-4" strokeWidth={1.9} />
              <span>{label}</span>
              {to === '/review' && dueCount > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  {dueCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-2 px-2 pt-6">
          {!online && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <CloudOff className="h-3.5 w-3.5" /> 当前离线
            </p>
          )}
          <SyncBadge />
          <p className="text-[11px] leading-4 text-stone-300">
            笔记存放在你自己的私有仓库里，随时可导出。
          </p>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-stone-200/70 bg-paper/90 px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-800 font-serif text-xs text-white">
            英
          </span>
          <span className="font-serif text-[15px] font-semibold text-stone-900">{pageTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          {dueCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
              <Wifi className="h-3.5 w-3.5" />
              {dueCount} 待复习
            </span>
          )}
          <SyncBadge />
        </div>
      </div>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-10 md:pb-16 md:pt-10">
        <div className="mx-auto w-full max-w-3xl">
          <Outlet />
        </div>
      </main>

      {/* 移动端底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="flex">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition ${
                  isActive ? 'text-teal-800' : 'text-stone-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className={isActive ? 'font-medium' : ''}>{label}</span>
                  {to === '/review' && dueCount > 0 && (
                    <span className="absolute right-[22%] top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-8">
          <div
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-card ${
              toast.kind === 'err'
                ? 'bg-red-600 text-white'
                : toast.kind === 'ok'
                  ? 'bg-teal-800 text-white'
                  : 'bg-stone-800 text-white'
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  )
}
