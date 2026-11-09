import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api, type WorkOrderFilter } from '../../api'
import { useCan } from '../../auth'
import Dropdown from '../../components/Dropdown'
import { Result, inputClass, useFormOptions } from './shared'

const PAGE_SIZE = 25

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
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Daftar Work Order</h1>
          <p className="text-sm text-slate-500">Cari work order, lalu klik barisnya untuk melihat atau mengubah.</p>
        </div>
        {can('work_order:create') && (
          <Link to="/schedule/work-order" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
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

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {['No. WO', 'Tanggal', 'Unit', 'Operator', 'Tipe', 'Location', 'RC id', 'Qty'].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={list.isFetching ? 'opacity-60' : ''}>
            {list.data?.items.map((w) => (
              <tr key={w.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">
                  {canEdit ? (
                    <Link to={`/schedule/work-order/${encodeURIComponent(w.id)}/edit`} className="text-blue-700 underline-offset-2 hover:underline">
                      {w.id}
                    </Link>
                  ) : (
                    w.id
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {w.startDate}
                  {w.finishDate && w.finishDate !== w.startDate ? ` s/d ${w.finishDate}` : ''}
                </td>
                <td className="px-3 py-2">
                  {w.unitId}
                  <div className="text-xs text-slate-500">{w.unitType}</div>
                </td>
                <td className="px-3 py-2">{w.operatorName}</td>
                <td className="px-3 py-2">{w.rcType}</td>
                <td className="max-w-[16rem] truncate px-3 py-2" title={w.location ?? ''}>
                  {w.location}
                </td>
                <td className="px-3 py-2">{w.rcId}</td>
                <td className="px-3 py-2">{w.qty}</td>
              </tr>
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
