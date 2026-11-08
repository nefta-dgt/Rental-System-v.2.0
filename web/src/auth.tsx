import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet } from 'react-router-dom'
import { ApiError, api } from './api'

export const meKey = ['me'] as const

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: api.me,
    retry: false,
    staleTime: 60_000,
  })
}

// Halaman di dalam route ini hanya bisa dibuka setelah login.
export function RequireAuth() {
  const { data, error, isPending } = useMe()
  if (isPending) return <p className="p-8 text-slate-500">Memuat...</p>
  if (error instanceof ApiError && error.status === 401) return <Navigate to="/login" replace />
  if (error || !data) return <p className="p-8 text-red-600">Gagal memuat data. Coba muat ulang halaman.</p>
  return <Outlet />
}
