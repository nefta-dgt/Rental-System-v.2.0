import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import Dropdown from '../../components/Dropdown'

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none transition-colors hover:border-slate-400 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40'

// Kolom read-only (otomatis): abu-abu, tanpa efek hover/fokus, supaya jelas tidak bisa diisi.
export const readOnlyClass =
  'w-full cursor-default rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-500 outline-none'

export const MAX_RANGE_DAYS = 31

const pad = (n: number) => String(n).padStart(2, '0')
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayIso = () => toIso(new Date())
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const shiftIso = (iso: string, days: number) => {
  const d = parse(iso)
  d.setDate(d.getDate() + days)
  return toIso(d)
}
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000) + 1

export function Field({ label, hint, error, optional, children }: { label: string; hint?: string; error?: string | null; optional?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-slate-700">
        {label} {optional && <span className="font-normal text-slate-400">(opsional)</span>}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function useFormOptions() {
  return useQuery({ queryKey: ['form-options'], queryFn: api.formOptions, staleTime: 5 * 60_000 })
}

export function UnitPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data, isPending, error } = useFormOptions()
  const options = useMemo(() => (data?.units ?? []).map((u) => ({ value: u.unitId, label: u.unitId, hint: u.unitType ?? '' })), [data])
  if (error) return <p className="text-sm text-red-600">Gagal memuat daftar unit. Muat ulang halaman.</p>
  return <Dropdown value={value} onChange={onChange} options={options} label="Unit" placeholder={isPending ? 'Memuat unit...' : 'Pilih unit'} searchable />
}

export function FormCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </main>
  )
}

export function Result({ kind, children, linkFrom, linkTo }: { kind: 'success' | 'error'; children: ReactNode; linkFrom?: string; linkTo?: string }) {
  const ok = kind === 'success'
  return (
    <div role={ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm ${ok ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-800'}`}>
      {children}
      {ok && linkFrom && (
        <div className="mt-2">
          <Link to={`/schedule?from=${linkFrom}&to=${linkTo ?? linkFrom}`} className="font-medium underline">
            Lihat di jadwal
          </Link>
        </div>
      )}
    </div>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
      {pending ? 'Menyimpan...' : children}
    </button>
  )
}
