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

// Untuk menyembunyikan menu dan tombol saja. Yang melindungi data adalah pengecekan di server.
export function useCan() {
  const { data } = useMe()
  return (permission: string) => !!data?.permissions.includes(permission)
}

// Halaman di dalam route ini hanya bisa dibuka kalau user punya izin yang diminta.
export function RequirePermission({ permission }: { permission: string }) {
  const can = useCan()
  if (!can(permission)) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Tidak ada akses</h1>
        <p className="text-sm text-slate-600">Anda belum punya izin untuk membuka halaman ini. Hubungi admin kalau butuh akses.</p>
      </main>
    )
  }
  return <Outlet />
}

// Halaman di dalam route ini hanya bisa dibuka setelah login.
export function RequireAuth() {
  const { data, error, isPending } = useMe()
  if (isPending) return <p className="p-8 text-slate-500">Memuat...</p>
  if (error instanceof ApiError && error.status === 401) return <Navigate to="/login" replace />
  if (error || !data) return <p className="p-8 text-red-600">Gagal memuat data. Coba muat ulang halaman.</p>
  return <Outlet />
}
