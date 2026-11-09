import { Fragment, useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api, type WorkOrderFilter } from '../../api'
import { useCan } from '../../auth'
import Dropdown from '../../components/Dropdown'
import { properCase } from '../../text'
import { Result, inputClass, useFormOptions } from './shared'

const PAGE_SIZE = 25

// Timestamp dari server berbentuk teks "YYYY-MM-DD HH:MM:SS..." atau ISO; tampilkan sampai menit.
const formatTimestamp = (t: string | null) => (t ? t.replace('T', ' ').slice(0, 16) : '')

// Judul pemisah per tanggal mulai, mis. "Senin, 9 Nov 2026".
const dayLabel = (iso: string | null) => {
  if (!iso) return 'Tanpa tanggal'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_COLORS: Record<string, string> = {
  Contract: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  'Mass Concrete': 'bg-amber-50 text-amber-800 ring-amber-600/20',
  Retail: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}
function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_COLORS[type] ?? 'bg-slate-50 text-slate-700 ring-slate-500/20'}`}>{type}</span>
}

// Filter disimpan di URL (?q=&rcType=&from=&to=&page=) supaya hasil pencarian bisa dibagikan dan tetap ada saat kembali dari halaman edit.
export default function WorkOrderList() {
  const can = useCan()
  const canEdit = can('work_order:edit')
  const location = useLocation()
  const deleted = (location.state as { deleted?: string } | null)?.deleted
  const [params, setParams] = useSearchParams()
  const { data: options } = useFormOptions()

  const filter: WorkOrderFilter = {
    q: params.get('q') ?? '',
    rcType: params.get('rcType') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: PAGE_SIZE,
  }
  const [q, setQ] = useState(filter.q ?? '')
  const cell = 'px-3 py-2.5'
  useEffect(() => setQ(params.get('q') ?? ''), [params])

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const list = useQuery({ queryKey: ['work-orders', filter], queryFn: () => api.listWorkOrders(filter), placeholderData: keepPreviousData })
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const typeOptions = [{ value: '', label: 'Semua tipe' }, ...(options?.rcTypes ?? []).map((t) => ({ value: t, label: t }))]
  const hasFilter = !!(filter.q || filter.rcType || filter.from || filter.to)

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Daftar Work Order</h1>
          <p className="text-sm text-slate-500">Cari work order, lalu klik barisnya untuk melihat atau mengubah.</p>
        </div>
        {can('work_order:create') && (
          <Link to="/schedule/work-order/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            Buat work order
          </Link>
        )}
      </div>

      {deleted && <Result kind="success">Work order {deleted} dihapus.</Result>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: q.trim() })
        }}
        className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-[1fr_12rem_9.5rem_9.5rem_auto]"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor WO, unit, operator, lokasi, RC id, catatan..." maxLength={100} aria-label="Cari" className={inputClass} />
        <Dropdown value={filter.rcType ?? ''} onChange={(v) => set({ rcType: v })} label="Tipe work order" options={typeOptions} />
        <input type="date" value={filter.from ?? ''} max={filter.to || undefined} onChange={(e) => set({ from: e.target.value })} aria-label="Tanggal dari" className={inputClass} />
        <input type="date" value={filter.to ?? ''} min={filter.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="Tanggal sampai" className={inputClass} />
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Cari
          </button>
          {hasFilter && (
            <button type="button" onClick={() => setParams({}, { replace: true })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Reset
            </button>
          )}
        </div>
      </form>

      {list.error && <Result kind="error">{list.error.message}</Result>}

      <div className="max-h-[calc(100vh-14rem)] min-h-64 overflow-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-20 text-xs uppercase text-slate-500">
            <tr>
              {['Dibuat', 'WO Id', 'Start / Finish date', 'Unit', 'Operator', 'Tipe', 'Location', 'Status'].map((h, i) => (
                <th
                  key={h}
                  className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium ${i === 0 ? 'sticky left-0 z-30 min-w-[10.5rem]' : ''} ${i === 1 ? 'sticky left-[10.5rem] z-30 border-r' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={list.isFetching ? 'opacity-60' : ''}>
            {list.data?.items.map((w, i, all) => (
              <Fragment key={w.id}>
                {(i === 0 || all[i - 1].startDate !== w.startDate) && (
                  <tr>
                    <th colSpan={8} className="border-b border-slate-200 bg-slate-100/70 px-3 py-1.5 text-left text-xs font-semibold text-slate-600">
                      {dayLabel(w.startDate)}
                    </th>
                  </tr>
                )}
                <tr className="group">
                  <td className={`sticky left-0 z-10 min-w-[10.5rem] whitespace-nowrap border-b border-slate-100 bg-white group-hover:bg-slate-50 ${cell}`}>
                    <div>{formatTimestamp(w.timestamp)}</div>
                    <div className="min-h-4 text-xs text-slate-500">{w.createdByName ?? <span className="text-slate-300">-</span>}</div>
                  </td>
                  <td className={`sticky left-[10.5rem] z-10 whitespace-nowrap border-b border-r border-slate-100 bg-white font-medium group-hover:bg-slate-50 ${cell}`}>
                    {canEdit ? (
                      <Link to={`/schedule/work-order/${encodeURIComponent(w.id)}/edit`} className="text-blue-700 underline-offset-2 hover:underline">
                        {w.id}
                      </Link>
                    ) : (
                      w.id
                    )}
                  </td>
                  <td className={`whitespace-nowrap border-b border-slate-100 group-hover:bg-slate-50 ${cell}`}>
                    {w.startDate}
                    <div className="text-xs text-slate-500">{w.finishDate}</div>
                  </td>
                  <td className={`whitespace-nowrap border-b border-slate-100 group-hover:bg-slate-50 ${cell}`}>
                    {w.unitId}
                    <div className="text-xs text-slate-500">{w.unitType}</div>
                  </td>
                  <td className={`whitespace-nowrap border-b border-slate-100 group-hover:bg-slate-50 ${cell}`}>{w.operatorName ? properCase(w.operatorName) : ''}</td>
                  <td className={`border-b border-slate-100 group-hover:bg-slate-50 ${cell}`}>
                    <TypeBadge type={w.rcType} />
                  </td>
                  <td className={`w-64 min-w-64 max-w-64 whitespace-normal break-words border-b border-slate-100 group-hover:bg-slate-50 ${cell}`} title={w.location ?? ''}>
                    {w.location ? properCase(w.location) : ''}
                  </td>
                  <td className={`border-b border-slate-100 group-hover:bg-slate-50 ${cell}`} />
                </tr>
              </Fragment>
            ))}
            {list.data && list.data.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Tidak ada work order yang cocok.
                </td>
              </tr>
            )}
            {list.isPending && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Memuat...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>
          {total.toLocaleString('id-ID')} work order{canEdit ? '' : ' (hanya lihat)'}
        </span>
        <div className="flex items-center gap-2">
          <button disabled={filter.page! <= 1} onClick={() => set({ page: String(filter.page! - 1) })} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
            Sebelumnya
          </button>
          <span>
            Halaman {filter.page} dari {pages}
          </span>
          <button disabled={filter.page! >= pages} onClick={() => set({ page: String(filter.page! + 1) })} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
            Berikutnya
          </button>
        </div>
      </div>
    </main>
  )
}
