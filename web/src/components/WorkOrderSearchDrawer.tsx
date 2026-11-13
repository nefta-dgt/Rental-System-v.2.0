import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type WorkOrderRow } from '../api'
import { useCan } from '../auth'
import { formatDate } from '../text'
import Dropdown, { type DropdownOption } from './Dropdown'
import { inputClass } from '../pages/records/shared'

export type WorkOrderSearch = { unitId: string; operatorId: string; date: string }

type Props = {
  open: boolean
  onClose: () => void
  unitOptions: DropdownOption[]
  operatorOptions: DropdownOption[]
  initial?: Partial<WorkOrderSearch>
  onSearch?: (filter: WorkOrderSearch) => void
  // Kalau diisi, tiap hasil bisa dipilih. Pemanggil yang menutup drawer.
  onSelect?: (wo: WorkOrderRow) => void
  selectedId?: string
}

const PAGE_SIZE = 10
const EMPTY: WorkOrderSearch = { unitId: '', operatorId: '', date: '' }

// Drawer pencarian work order; hasilnya bisa dipilih lewat onSelect.
export default function WorkOrderSearchDrawer({ open, onClose, unitOptions, operatorOptions, initial, onSearch, onSelect, selectedId }: Props) {
  const [unitId, setUnitId] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [date, setDate] = useState('')
  const [applied, setApplied] = useState<WorkOrderSearch>(EMPTY)
  const [page, setPage] = useState(1)
  const can = useCan()
  const allowed = can('work_order:view')

  useEffect(() => {
    if (!open) return
    const start = { unitId: initial?.unitId ?? '', operatorId: initial?.operatorId ?? '', date: initial?.date ?? '' }
    setUnitId(start.unitId)
    setOperatorId(start.operatorId)
    setDate(start.date)
    setApplied(start)
    setPage(1)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // API mencari operator berdasarkan nama, jadi kirim label dropdown, bukan id.
  const operatorName = operatorOptions.find((o) => o.value === applied.operatorId)?.label ?? ''
  const filter = { unitId: applied.unitId, operator: operatorName, date: applied.date, page, pageSize: PAGE_SIZE }
  const list = useQuery({ queryKey: ['wo-search-drawer', filter], queryFn: () => api.listWorkOrders(filter), enabled: open && allowed, placeholderData: keepPreviousData })
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Terapkan filter otomatis 400 ms setelah input berhenti berubah.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (applied.unitId === unitId && applied.operatorId === operatorId && applied.date === date) return
      const next = { unitId, operatorId, date }
      setApplied(next)
      setPage(1)
      onSearch?.(next)
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, operatorId, date, open])

  const reset = () => {
    setUnitId('')
    setOperatorId('')
    setDate('')
    setApplied(EMPTY)
    setPage(1)
  }

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Cari work order"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-xl transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Cari Work Order</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-800">Unit ID</label>
            <Dropdown className="[&>button]:min-w-0" value={unitId} onChange={setUnitId} options={unitOptions} label="Unit ID" placeholder="-- Pilih Unit --" searchable />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-800">Operator</label>
            <Dropdown className="[&>button]:min-w-0" value={operatorId} onChange={setOperatorId} options={operatorOptions} label="Operator" placeholder="-- Pilih Operator --" searchable />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-800">Tanggal</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <h3 className="font-semibold text-slate-800">Data Work Order</h3>
              {allowed && <span className="text-slate-500">{list.isFetching ? 'Memuat...' : `${total} data`}</span>}
            </div>
            {!allowed ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Anda tidak punya izin melihat work order.</p>
            ) : list.error ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(list.error as Error).message}</p>
            ) : list.data && list.data.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Tidak ada work order.</p>
            ) : (
              <ul className="space-y-2">
                {list.data?.items.map((w) => {
                  const chosen = w.id === selectedId
                  const body = (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{w.id}</span>
                        <span className="text-slate-500">{chosen ? 'Terpilih' : w.rcType ?? '-'}</span>
                      </div>
                      <div className="mt-1 text-slate-700">{w.unitId ?? '-'}{w.unitType ? ` · ${w.unitType}` : ''} · {w.operatorName ?? '-'}</div>
                      <div className="text-slate-500">{formatDate(w.startDate)} - {formatDate(w.finishDate)}</div>
                      {w.location && <div className="text-slate-500">{w.location}</div>}
                    </>
                  )
                  return (
                    <li key={w.id}>
                      {onSelect ? (
                        <button
                          type="button"
                          onClick={() => onSelect(w)}
                          aria-pressed={chosen}
                          className={`block w-full rounded-lg border p-3 text-left text-sm hover:border-blue-400 hover:bg-blue-50/50 ${chosen ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="rounded-lg border border-slate-200 p-3 text-sm">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {allowed && pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">Sebelumnya</button>
            <span>Halaman {page} dari {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40">Berikutnya</button>
          </div>
        )}
        <div className="flex gap-2 border-t border-slate-200 p-4">
          <button type="button" onClick={reset} className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">Reset</button>
        </div>
      </aside>
    </>
  )
}
