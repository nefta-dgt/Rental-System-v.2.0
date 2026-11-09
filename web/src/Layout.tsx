import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import { meKey, useCan, useMe } from './auth'
import { activeSection, isTabActive, resolveTo, sectionLanding, visibleMenu, visibleTabs } from './menu'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

const itemClass = (active: boolean) =>
  `block rounded-lg px-3 py-2 text-sm ${active ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`

export default function Layout() {
  const { data: me } = useMe()
  const can = useCan()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const [drawer, setDrawer] = useState(false)

  useEffect(() => setDrawer(false), [pathname])

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: meKey })
      navigate('/login', { replace: true })
    },
  })

  if (!me) return null

  const section = activeSection(pathname)
  const tabs = section ? visibleTabs(section, can) : []

  return (
    <div className="min-h-screen bg-slate-100">
      {drawer && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <aside
        aria-label="Menu utama"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${drawer ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-5 py-4 font-semibold text-slate-900">Rental System v2</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <NavLink to="/" end className={({ isActive }) => itemClass(isActive)}>
            Beranda
          </NavLink>

          {visibleMenu(can).map((m) =>
            m.soon ? (
              <div key={m.key} aria-disabled="true" title="Segera hadir" className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400">
                <span>{m.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">Segera</span>
              </div>
            ) : (
              <Link key={m.key} to={sectionLanding(m, can)} aria-current={section?.key === m.key ? 'page' : undefined} className={itemClass(section?.key === m.key)}>
                {m.label}
              </Link>
            ),
          )}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-3 px-1">
            <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
              {initials(me.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900" title={me.name}>
                {me.name}
              </div>
              <div className="truncate text-xs text-slate-500">{me.role ?? 'Tanpa peran'}</div>
            </div>
          </div>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Keluar
          </button>
        </div>
      </aside>

      <div className="md:pl-60">
        {/* Header mengikuti menu utama yang aktif: judul bagian, lalu tab sub menunya. */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 px-3 py-3 sm:px-6">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Buka menu" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" />
              </svg>
            </button>
            <div className="font-semibold text-slate-900">{section?.label ?? (pathname === '/' ? (can('schedule:view') ? 'Jadwal Unit' : 'Beranda') : 'Rental System v2')}</div>
          </div>
          {section && tabs.length > 0 && (
            <nav aria-label={`Sub menu ${section.label}`} className="flex gap-1 overflow-x-auto px-3 sm:px-6">
              {tabs.map((t) => {
                const active = isTabActive(t, pathname, can)
                return (
                  <Link
                    key={t.label}
                    to={resolveTo(t, can)}
                    aria-current={active ? 'page' : undefined}
                    className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? 'border-blue-600 font-medium text-blue-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
                  >
                    {t.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </header>
        <Outlet />
      </div>
    </div>
  )
}
