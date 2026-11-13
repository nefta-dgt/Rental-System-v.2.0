import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { formatTimestamp, properCase } from '../../text'
import { Result, inputClass } from '../records/shared'

const PAGE_SIZE = 25
const LOW_CONFIDENCE = 0.9

// Timesheet hasil OCR yang menunggu approval (rental.buffer_timesheet, status PENDING). Filter disimpan di URL (?q=&page=).
export default function ApprovalList() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1) || 1
  const [text, setText] = useState(q)
  useEffect(() => setText(params.get('q') ?? ''), [params])

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const list = useQuery({ queryKey: ['approvals', q, page], queryFn: () => api.listApprovals({ q, page, pageSize: PAGE_SIZE }), placeholderData: keepPreviousData })
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <main className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Timesheet Approval</h1>
        <p className="text-sm text-slate-500">Timesheet hasil OCR yang belum di-approve atau di-decline.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: text.trim() })
        }}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-white p-4 shadow-sm"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari nomor TS, unit, pelanggan, operator..." maxLength={100} aria-label="Cari" className={inputClass} />
        <div className="flex gap-2 whitespace-nowrap">
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Cari
          </button>
          {q && (
            <button type="button" onClick={() => setParams({}, { replace: true })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Reset
            </button>
          )}
        </div>
      </form>

      {list.error && <Result kind="error">{list.error.message}</Result>}

      <div className="max-h-[calc(100vh-14rem)] min-h-64 overflow-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-20 text-xs uppercase text-slate-500">
            <tr>
              {['Masuk', 'No TS', 'Unit', 'Tanggal', 'Pelanggan', 'Operator', 'Volume', 'OCR', ''].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={list.isFetching ? 'opacity-60' : ''}>
            {list.data?.items.map((r) => {
              const low = r.confidence !== null && r.confidence < LOW_CONFIDENCE
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">{formatTimestamp(r.createdAt)}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 font-medium text-slate-900">{r.tsNo ?? <span className="text-amber-600">(kosong)</span>}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                    {r.unitId}
                    <div className="text-xs text-slate-500">{r.unitType}</div>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">{r.date}</td>
                  <td className="max-w-56 border-b border-slate-100 px-3 py-2.5">
                    <div className="truncate">{r.customer ? properCase(r.customer) : ''}</div>
                    <div className="truncate text-xs text-slate-500">{r.location ? properCase(r.location) : ''}</div>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">{r.operator ? properCase(r.operator) : ''}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 tabular-nums">{r.volume}</td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5">
                    <span title={r.doubtfulFields ? `Ragu: ${r.doubtfulFields}` : undefined} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${low ? 'bg-amber-50 text-amber-700 ring-amber-600/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'}`}>
                      {r.confidence === null ? '-' : `${Math.round(r.confidence * 100)}%`}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-right">
                    <Link to={`/timesheet/approval/${encodeURIComponent(r.id)}`} className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50">
                      Periksa
                    </Link>
                    <button type="button" className="ml-2 rounded-lg border border-red-300 px-3 py-1 text-red-600 hover:bg-red-50">
                      Buang
                    </button>
                  </td>
                </tr>
              )
            })}
            {list.data && list.data.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  Tidak ada timesheet yang menunggu approval.
                </td>
              </tr>
            )}
            {list.isPending && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  Memuat...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:-mx-6 sm:-mb-6 sm:px-6">
        <span>{total.toLocaleString('id-ID')} menunggu</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
            Sebelumnya
          </button>
          <span>
            Halaman {page} dari {pages}
          </span>
          <button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
            Berikutnya
          </button>
        </div>
      </div>
    </main>
  )
}
