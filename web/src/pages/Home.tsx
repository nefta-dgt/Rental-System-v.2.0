import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { meKey, useMe } from '../auth'

export default function Home() {
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
  const allAccess = me.sections.includes('*')

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-white px-6 py-3 shadow-sm">
        <span className="font-semibold text-slate-900">Rental System v2</span>
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

      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Selamat datang, {me.name}</h1>
        <p className="mb-4 text-sm text-slate-600">
          {allAccess ? 'Akses penuh ke semua bagian.' : 'Bagian yang boleh Anda akses:'}
        </p>
        {!allAccess && (
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {me.sections.length === 0 && <li>Belum ada akses. Hubungi admin.</li>}
            {me.sections.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
