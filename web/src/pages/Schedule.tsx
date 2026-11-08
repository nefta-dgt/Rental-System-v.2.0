import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, type Cell, type ScheduleUnit } from '../api'

type Kind = 'wo' | 'standby' | 'maintenance'
type Picked = { unitId: string; date: string; kind: Kind }

const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const KIND_LABEL: Record<Kind, string> = { wo: 'Work order', standby: 'Standby', maintenance: 'Maintenance' }
const KIND_STYLE: Record<Kind, string> = {
  wo: 'border-blue-300 bg-blue-100 text-blue-900',
  standby: 'border-amber-300 bg-amber-100 text-amber-900',
  maintenance: 'border-rose-300 bg-rose-100 text-rose-900',
}
const NO_TYPE = 'Tanpa tipe'

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const mondayOf = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const shift = (iso: string, days: number) => {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return toIso(d)
}
const shortDate = (iso: string) => {
  const d = parseIso(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function kindsOf(cell: Cell): Kind[] {
  const k: Kind[] = []
  if (cell.wo.length) k.push('wo')
  if (cell.standby) k.push('standby')
  if (cell.maintenance !== null) k.push('maintenance')
  return k
}

export default function Schedule() {
  const [params, setParams] = useSearchParams()
  const thisMonday = toIso(mondayOf(new Date()))
  const raw = params.get('from')
  const from = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? toIso(mondayOf(parseIso(raw))) : thisMonday
  const today = toIso(new Date())

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [picked, setPicked] = useState<Picked | null>(null)

  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ['schedule', from],
    queryFn: () => api.schedule(from),
    placeholderData: keepPreviousData,
  })

  const goTo = (iso: string) => {
    setPicked(null)
    setParams(iso === thisMonday ? {} : { from: iso })
  }

  const groups = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const map = new Map<string, ScheduleUnit[]>()
    for (const u of data.units) {
      if (!showInactive && !u.active) continue
      if (q && !u.unitId.toLowerCase().includes(q)) continue
      const type = u.unitType || NO_TYPE
      map.set(type, [...(map.get(type) ?? []), u])
    }
    return [...map.entries()].sort(([a], [b]) => (a === NO_TYPE ? 1 : b === NO_TYPE ? -1 : a.localeCompare(b)))
  }, [data, search, showInactive])

  const totals = useMemo(() => {
    const t = { wo: 0, standby: 0, maintenance: 0, kosong: 0, bentrok: 0 }
    for (const [, units] of groups)
      for (const u of units)
        for (const c of u.cells) {
          const k = kindsOf(c)
          if (k.length === 0) t.kosong++
          for (const x of k) t[x]++
          if (c.wo.length && c.maintenance !== null) t.bentrok++
        }
    return t
  }, [groups])

  const detail = useMemo(() => {
    if (!data || !picked) return null
    const unit = data.units.find((u) => u.unitId === picked.unitId)
    const cell = unit?.cells[data.days.indexOf(picked.date)]
    return unit && cell ? { unit, cell } : null
  }, [data, picked])

  if (isPending) return <p className="p-8 text-slate-500">Memuat jadwal...</p>
  if (error || !data) return <p className="p-8 text-red-600">Gagal memuat jadwal. Coba muat ulang halaman.</p>

  const cards: [string, number, string][] = [
    ['Work order', totals.wo, 'bg-blue-500'],
    ['Standby', totals.standby, 'bg-amber-500'],
    ['Maintenance', totals.maintenance, 'bg-rose-500'],
    ['Hari kosong', totals.kosong, 'bg-slate-300'],
  ]

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold text-slate-900">Jadwal unit</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari unit, misalnya K-33"
          className="w-52 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Unit nonaktif
        </label>
        <div className="flex items-center gap-1">
          <button aria-label="Minggu sebelumnya" onClick={() => goTo(shift(from, -7))} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">
            ‹
          </button>
          <span className={`min-w-40 text-center text-sm font-medium text-slate-900 ${isFetching ? 'opacity-60' : ''}`}>
            {shortDate(data.from)} – {shortDate(data.to)} {parseIso(data.to).getFullYear()}
          </span>
          <button aria-label="Minggu berikutnya" onClick={() => goTo(shift(from, 7))} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">
            ›
          </button>
          <button onClick={() => goTo(thisMonday)} className="ml-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50">
            Minggu ini
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, n, dot]) => (
          <div key={label} className="rounded-lg bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {label}
            </div>
            <div className="text-xl font-semibold text-slate-900">
              {n} <span className="text-xs font-normal text-slate-400">hari-unit</span>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-28 border-b border-r border-slate-200 bg-white px-3 py-2 text-left font-normal text-slate-500">Unit</th>
              {data.days.map((d, i) => (
                <th key={d} className={`border-b border-slate-200 py-2 font-normal ${i > 4 ? 'bg-slate-50' : ''} ${d === today ? 'text-blue-600 shadow-[inset_0_-2px_0_#2563eb]' : 'text-slate-500'}`}>
                  {DAY_NAMES[i]}
                  <br />
                  <span className={d === today ? 'font-semibold' : ''}>{shortDate(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-sm text-slate-500">
                  Unit tidak ditemukan.
                </td>
              </tr>
            )}
            {groups.map(([type, units]) => {
              const open = !closed[type]
              const kosong = units.reduce((n, u) => n + u.cells.filter((c) => kindsOf(c).length === 0).length, 0)
              return [
                <tr key={type}>
                  <td colSpan={8} className="border-b border-slate-200 bg-slate-50">
                    <button onClick={() => setClosed((c) => ({ ...c, [type]: open }))} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-900" aria-expanded={open}>
                      <span className="w-3 text-slate-400">{open ? '▾' : '▸'}</span>
                      {type}
                      <span className="text-xs font-normal text-slate-400">
                        {units.length} unit, {kosong} hari kosong
                      </span>
                    </button>
                  </td>
                </tr>,
                ...(open ? units.map((u) => (
                  <tr key={u.unitId} className={u.active ? '' : 'opacity-60'}>
                    <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 align-top text-sm font-medium text-slate-900">
                      {u.unitId}
                      {!u.active && <div className="text-[11px] font-normal text-slate-400">nonaktif</div>}
                    </td>
                    {u.cells.map((c, i) => {
                      const date = data.days[i]
                      return (
                        <td key={date} className={`relative border-b border-slate-200 p-1 align-top ${i > 4 ? 'bg-slate-50' : ''}`}>
                          <div className="space-y-0.5">
                            {kindsOf(c).map((k) => {
                              const selected = picked?.unitId === u.unitId && picked.date === date && picked.kind === k
                              return (
                                <button key={k} onClick={() => setPicked({ unitId: u.unitId, date, kind: k })} className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] ${KIND_STYLE[k]} ${selected ? 'outline outline-2 outline-offset-1 outline-slate-900' : ''}`}>
                                  {KIND_LABEL[k]}
                                  {k === 'wo' && c.wo.length > 1 ? ` ×${c.wo.length}` : ''}
                                </button>
                              )
                            })}
                          </div>
                          {c.wo.length > 0 && c.maintenance !== null && <span title="Bentrok: work order saat maintenance" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-600" />}
                        </td>
                      )
                    })}
                  </tr>
                )) : []),
              ]
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border ${KIND_STYLE[k]}`} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-600" />
          Bentrok: work order saat maintenance ({totals.bentrok} hari-unit minggu ini)
        </span>
      </div>

      <section className="rounded-lg bg-white p-4 text-sm shadow-sm" aria-live="polite">
        {!picked || !detail ? (
          <p className="text-slate-500">Klik sebuah status di tabel untuk melihat detailnya.</p>
        ) : (
          <div className="space-y-2">
            <h2 className="font-medium text-slate-900">
              {detail.unit.unitId} <span className="font-normal text-slate-500">({detail.unit.unitType ?? NO_TYPE})</span>, {shortDate(picked.date)}
            </h2>
            {kindsOf(detail.cell).map((k) => (
              <div key={k}>
                <span className={`rounded border px-1.5 py-0.5 text-xs ${KIND_STYLE[k]}`}>{KIND_LABEL[k]}</span>
                {k === 'wo' && (
                  <ul className="mt-1 list-disc pl-5 text-slate-700">
                    {detail.cell.wo.map((w) => (
                      <li key={w.id}>
                        {w.id}
                        {w.rcId ? `, kontrak ${w.rcId}` : ''}
                        {w.location ? `, ${w.location}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {k === 'maintenance' && <p className="mt-1 text-slate-700">{detail.cell.maintenance || 'Tanpa keterangan.'}</p>}
                {k === 'standby' && <p className="mt-1 text-slate-700">Unit standby pada hari ini.</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
