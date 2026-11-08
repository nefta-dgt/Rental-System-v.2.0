import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { meKey, useMe } from '../auth'

export default function Login() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meKey })
      navigate('/', { replace: true })
    },
  })

  if (me) return <Navigate to="/" replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Rental System v2</h1>
          <p className="text-sm text-slate-500">Masuk dengan akun Anda</p>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {login.error && (
          <p role="alert" className="text-sm text-red-600">
            {login.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-md bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {login.isPending ? 'Masuk...' : 'Masuk'}
        </button>
      </form>
    </main>
  )
}
