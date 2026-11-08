import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from './api'
import { meKey, useMe } from './auth'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1 text-sm ${isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`

export default function Layout() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: meKey })
      navigate('/login', { replace: true })
    },
  })

  if (!me) return null

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-900">Rental System v2</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={linkClass}>
              Beranda
            </NavLink>
            <NavLink to="/schedule" className={linkClass}>
              Jadwal unit
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-600">
            {me.name} <span className="text-slate-400">({me.role ?? 'tanpa peran'})</span>
          </span>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            Keluar
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
