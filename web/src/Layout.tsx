import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import { meKey, useCan, useMe } from './auth'

const SUB_ITEMS = [
  { to: '/schedule/work-order', label: 'Work Order', permission: 'work_order:create' },
  { to: '/schedule/maintenance', label: 'Maintenance', permission: 'maintenance:create' },
  { to: '/schedule/standby', label: 'Standby', permission: 'standby:create' },
]

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`

export default function Layout() {
  const { data: me } = useMe()
  const can = useCan()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const [drawer, setDrawer] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(pathname.startsWith('/schedule'))

  useEffect(() => {
    setDrawer(false)
    if (pathname.startsWith('/schedule')) setScheduleOpen(true)
  }, [pathname])

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: meKey })
      navigate('/login', { replace: true })
    },
  })

  if (!me) return null

  const subItems = SUB_ITEMS.filter((s) => can(s.permission))
  const canSchedule = can('schedule:view')
  const showSchedule = canSchedule || subItems.length > 0

  return (
    <div className="min-h-screen bg-slate-100">
      {drawer && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <aside
        aria-label="Menu utama"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${drawer ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-5 py-4 font-semibold text-slate-900">Rental System v2</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <NavLink to="/" end className={itemClass}>
            Beranda
          </NavLink>

          {showSchedule && (
            <div>
              <div className="flex items-center gap-1">
                {canSchedule ? (
                  <NavLink to="/schedule" end className={(s) => `${itemClass(s)} flex-1`}>
                    Jadwal Unit
                  </NavLink>
                ) : (
                  <span className="flex-1 px-3 py-2 text-sm text-slate-600">Jadwal Unit</span>
                )}
                {subItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setScheduleOpen((o) => !o)}
                    aria-expanded={scheduleOpen}
                    aria-label={scheduleOpen ? 'Tutup submenu Jadwal Unit' : 'Buka submenu Jadwal Unit'}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                  >
                    <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${scheduleOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 8 5 5 5-5" />
                    </svg>
                  </button>
                )}
              </div>
              {scheduleOpen && subItems.length > 0 && (
                <ul className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-2">
                  {subItems.map((s) => (
                    <li key={s.to}>
                      <NavLink to={s.to} className={itemClass}>
                        {s.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </nav>
      </aside>

      <div className="md:pl-60">
        <header className="flex items-center justify-between gap-2 bg-white px-3 py-3 shadow-sm sm:px-6">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Buka menu" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <div className="ml-auto flex items-center gap-2 text-sm sm:gap-4">
            <span className="hidden text-slate-600 sm:inline">
              {me.name} <span className="text-slate-400">({me.role ?? 'tanpa peran'})</span>
            </span>
            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50"
            >
              Keluar
            </button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
