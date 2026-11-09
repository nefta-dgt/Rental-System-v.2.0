import { Fragment, useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type DayRecordFilter } from '../../api'
import { useCan } from '../../auth'
import { dayLabel, formatDate, formatTimestamp, properCase } from '../../text'
import { Result, inputClass } from './shared'

type Kind = 'maintenance' | 'standby'

const PAGE_SIZE = 25

const TEXT: Record<Kind, { title: string; description: string; create: string; searchPlaceholder: string }> = {
  maintenance: {
    title: 'Daftar Maintenance',
    description: 'Satu baris per unit per hari.',
    create: 'Buat maintenance',
    searchPlaceholder: 'Cari keterangan...',
  },
  standby: {
    title: 'Daftar Standby',
    description: 'Satu baris per unit per hari.',
    create: 'Buat standby',
    searchPlaceholder: 'Cari nama pembuat...',
  },
}

// Filter disimpan di URL (?q=&unitId=&date=&page=) supaya hasil pencarian bisa dibagikan dan tetap ada saat kembali dari halaman lain.
export default function DayRecordList({ kind }: { kind: Kind }) {
  const t = TEXT[kind]
  const can = useCan()
  const [params, setParams] = useSearchParams()

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

  const list = useQuery({
    queryKey: ['day-records', kind, filter],
    queryFn: () => api.listDayRecords(kind, filter),
    placeholderData: keepPreviousData,
  })
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilter = !!(filter.q || filter.unitId || filter.date)

  // Pembuat tampil di bawah timestamp, seperti Created by di daftar work order. Maintenance punya kolom Keterangan (remarks).
  const headers = kind === 'maintenance' ? ['Dibuat', 'Unit', 'Tanggal', 'Keterangan'] : ['Dibuat', 'Unit', 'Tanggal']

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t.title}</h1>
          <p className="text-sm text-slate-500">{t.description}</p>
        </div>
        {can(`${kind}:create`) && (
          <Link to={`/schedule/${kind}/new`} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            {t.create}
          </Link>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: text.q.trim(), unitId: text.unitId.trim() })
        }}
        className="grid gap-3 rounded-xl bg-white p-4 shadow-sm grid-cols-[minmax(0,1fr)_8rem_10rem_auto] items-center"
      >
        <input value={text.q} onChange={(e) => setText({ ...text, q: e.target.value })} placeholder={t.searchPlaceholder} maxLength={100} aria-label="Cari" className={inputClass} />
        <input value={text.unitId} onChange={(e) => setText({ ...text, unitId: e.target.value })} placeholder="Unit ID" maxLength={100} aria-label="Unit ID" className={inputClass} />
        <input type="date" value={filter.date ?? ''} onChange={(e) => set({ date: e.target.value })} aria-label="Tanggal" className={inputClass} />
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
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-20 text-xs uppercase text-slate-500">
            <tr>
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={list.isFetching ? 'opacity-60' : ''}>
            {list.data?.items.map((r, i, all) => (
              <Fragment key={r.id}>
                {(i === 0 || all[i - 1].date !== r.date) && (
                  <tr>
                    <th colSpan={headers.length} className="border-b border-slate-200 bg-slate-100/70 px-3 py-1.5 text-left text-xs font-semibold text-slate-600">
                      {dayLabel(r.date)}
                    </th>
                  </tr>
                )}
                <tr className="hover:bg-slate-50">
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                    <div>{formatTimestamp(r.createdAt)}</div>
                    <div className="min-h-4 text-xs text-slate-500">{r.createdByName ? properCase(r.createdByName) : <span className="text-slate-300">-</span>}</div>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                    {r.unitId}
                    <div className="text-xs text-slate-500">{r.unitType}</div>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">{formatDate(r.date)}</td>
                  {kind === 'maintenance' && (
                    <td className="w-80 min-w-64 max-w-md whitespace-normal break-words border-b border-slate-100 px-3 py-2.5">{r.note ? properCase(r.note) : ''}</td>
                  )}
                </tr>
              </Fragment>
            ))}
            {list.data && list.data.items.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">
                  Tidak ada data yang cocok.
                </td>
              </tr>
            )}
            {list.isPending && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">
                  Memuat...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:-mx-6 sm:-mb-6 sm:px-6">
        <span>{total.toLocaleString('id-ID')} baris</span>
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
