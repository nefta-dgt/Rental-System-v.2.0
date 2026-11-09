import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type DayRecordFilter, type StandbyRange } from '../../api'
import { useCan } from '../../auth'
import { formatDate, formatTimestamp, properCase } from '../../text'
import { Result, inputClass, todayIso } from './shared'

const PAGE_SIZE = 25

type Status = 'ongoing' | 'upcoming' | 'done'
const STATUS: Record<Status, { label: string; badge: string; bar: string }> = {
  ongoing: { label: 'Berlangsung', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', bar: 'bg-emerald-500' },
  upcoming: { label: 'Akan datang', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', bar: 'bg-blue-500' },
  done: { label: 'Selesai', badge: 'bg-slate-50 text-slate-600 ring-slate-500/20', bar: 'bg-slate-300' },
}
const statusOf = (r: StandbyRange, today: string): Status => (r.finishDate < today ? 'done' : r.startDate > today ? 'upcoming' : 'ongoing')

// Standby digabung per rentang: hari berurutan untuk satu unit menjadi satu baris.
// Filter disimpan di URL (?q=&unitId=&date=&page=).
export default function StandbyList() {
  const can = useCan()
  const [params, setParams] = useSearchParams()
  const today = todayIso()

  const filter: DayRecordFilter = {
    q: params.get('q') ?? '',
    unitId: params.get('unitId') ?? '',
    date: params.get('date') ?? '',
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: PAGE_SIZE,
  }
  const [text, setText] = useState({ q: filter.q ?? '', unitId: filter.unitId ?? '' })
  useEffect(() => setText({ q: params.get('q') ?? '', unitId: params.get('unitId') ?? '' }), [params])

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const list = useQuery({ queryKey: ['day-records', 'standby', 'ranges', filter], queryFn: () => api.listStandbyRanges(filter), placeholderData: keepPreviousData })
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilter = !!(filter.q || filter.unitId || filter.date)

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Daftar Standby</h1>
          <p className="text-sm text-slate-500">Hari berurutan untuk satu unit digabung menjadi satu baris.</p>
        </div>
        {can('standby:create') && (
          <Link to="/schedule/standby/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            Buat standby
          </Link>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: text.q.trim(), unitId: text.unitId.trim() })
        }}
        className="grid grid-cols-[minmax(0,1fr)_8rem_10rem_auto] items-center gap-3 rounded-xl bg-white p-4 shadow-sm"
      >
        <input value={text.q} onChange={(e) => setText({ ...text, q: e.target.value })} placeholder="Cari nama pembuat..." maxLength={100} aria-label="Cari" className={inputClass} />
        <input value={text.unitId} onChange={(e) => setText({ ...text, unitId: e.target.value })} placeholder="Unit ID" maxLength={100} aria-label="Unit ID" className={inputClass} />
        <input type="date" value={filter.date ?? ''} onChange={(e) => set({ date: e.target.value })} aria-label="Tanggal (standby yang mencakup tanggal ini)" title="Menampilkan standby yang periodenya mencakup tanggal ini" className={inputClass} />
        <div className="flex gap-2 whitespace-nowrap">
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
        <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-20 text-xs uppercase text-slate-500">
            <tr>
              {['Unit', 'Periode', 'Lama', 'Status', 'Dibuat'].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={list.isFetching ? 'opacity-60' : ''}>
            {list.data?.items.map((r) => {
              const st = STATUS[statusOf(r, today)]
              const single = r.startDate === r.finishDate
              return (
                <tr key={`${r.unitId}:${r.startDate}`} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap border-b border-slate-100 py-2.5 pl-0 pr-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-9 w-1 shrink-0 rounded-r ${st.bar}`} aria-hidden />
                      <div>
                        <div className="font-medium text-slate-900">{r.unitId}</div>
                        <div className="text-xs text-slate-500">{r.unitType}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                    {single ? (
                      formatDate(r.startDate)
                    ) : (
                      <>
                        <div>{formatDate(r.startDate)}</div>
                        <div className="text-slate-500">s/d {formatDate(r.finishDate)}</div>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 tabular-nums">{r.days} hari</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${st.badge}`}>{st.label}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                    <div>{formatTimestamp(r.createdAt)}</div>
                    <div className="min-h-4 text-xs text-slate-500">{r.createdByName ? properCase(r.createdByName) : <span className="text-slate-300">-</span>}</div>
                  </td>
                </tr>
              )
            })}
            {list.data && list.data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Tidak ada data yang cocok.
                </td>
              </tr>
            )}
            {list.isPending && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Memuat...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:-mx-6 sm:-mb-6 sm:px-6">
        <span>{total.toLocaleString('id-ID')} rentang standby</span>
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
