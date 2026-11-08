import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api, type Cell, type ScheduleUnit, type WorkOrder } from '../api'
import Dropdown, { type DropdownOption } from '../components/Dropdown'
import { properCase } from '../text'

type Kind = 'wo' | 'standby' | 'maintenance'
type Bar = {
  key: string
  kind: Kind
  start: number
  end: number
  lane: number
  label: string
  conflict: boolean
  wo?: WorkOrder
  remarks?: string
}
type Picked = { unitId: string; barKey: string; rect: { left: number; top: number; bottom: number } }

const WEEKDAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const KIND_LABEL: Record<Kind, string> = { wo: 'Work order', standby: 'Standby', maintenance: 'Maintenance' }
const KIND_STYLE: Record<Kind, string> = {
  wo: 'border-blue-300 bg-blue-100 text-blue-900',
  standby: 'border-amber-300 bg-amber-100 text-amber-900',
  maintenance: 'border-rose-300 bg-rose-100 text-rose-900',
}
const NO_TYPE = 'Tanpa tipe'
const MAX_DAYS = 7
const DAY_COL = 96
const UNIT_COL = 112
const UNIT_COL_MOBILE = 72
const BAR_H = 22

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const isValidIso = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseIso(s).getTime())
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
const diffDays = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000)
const shortDate = (iso: string) => {
  const d = parseIso(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
const fullDate = (iso: string) => `${shortDate(iso)} ${parseIso(iso).getFullYear()}`

function kindsOf(cell: Cell): Kind[] {
  const k: Kind[] = []
  if (cell.wo.length) k.push('wo')
  if (cell.standby) k.push('standby')
  if (cell.maintenance !== null) k.push('maintenance')
  return k
}

// Mengubah data per hari menjadi batang menerus per status, lalu menata batang yang tumpang tindih ke baris (lane) berbeda.
function buildBars(unit: ScheduleUnit): { bars: Bar[]; lanes: number } {
  const n = unit.cells.length
  const bars: Omit<Bar, 'lane'>[] = []

  const woMap = new Map<string, { wo: WorkOrder; start: number; end: number }>()
  unit.cells.forEach((c, i) =>
    c.wo.forEach((w) => {
      const e = woMap.get(w.id)
      if (e) e.end = i
      else woMap.set(w.id, { wo: w, start: i, end: i })
    }),
  )
  woMap.forEach(({ wo, start, end }) =>
    bars.push({ key: `wo:${wo.id}`, kind: 'wo', start, end, label: `${wo.rcType ?? '-'} : ${wo.location ? properCase(wo.location) : '-'}`, conflict: false, wo }),
  )

  for (let i = 0; i < n; i++) {
    if (!unit.cells[i].standby) continue
    let j = i
    while (j + 1 < n && unit.cells[j + 1].standby) j++
    bars.push({ key: `standby:${i}`, kind: 'standby', start: i, end: j, label: 'Standby', conflict: false })
    i = j
  }
  for (let i = 0; i < n; i++) {
    const r = unit.cells[i].maintenance
    if (r === null) continue
    let j = i
    while (j + 1 < n && unit.cells[j + 1].maintenance === r) j++
    bars.push({ key: `maintenance:${i}`, kind: 'maintenance', start: i, end: j, label: r ? `Maintenance : ${r}` : 'Maintenance', conflict: false, remarks: r })
    i = j
  }

  const range = (b: { start: number; end: number }) => unit.cells.slice(b.start, b.end + 1)
  for (const b of bars) {
    if (b.kind === 'wo') b.conflict = range(b).some((c) => c.maintenance !== null)
    if (b.kind === 'maintenance') b.conflict = range(b).some((c) => c.wo.length > 0)
  }

  bars.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const laneEnds: number[] = []
  const placed = bars.map((b) => {
    let lane = laneEnds.findIndex((e) => e < b.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = b.end
    return { ...b, lane }
  })
  return { bars: placed, lanes: Math.max(1, laneEnds.length) }
}

export default function Schedule() {
  const [params, setParams] = useSearchParams()
  const today = toIso(new Date())
  const defFrom = toIso(mondayOf(new Date()))
  const defTo = shift(defFrom, 6)

  const rawFrom = params.get('from')
  const rawTo = params.get('to')
  const from = isValidIso(rawFrom) ? rawFrom : defFrom
  let to = isValidIso(rawTo) ? rawTo : shift(from, MAX_DAYS - 1)
  if (to < from || to > shift(from, MAX_DAYS - 1)) to = shift(from, MAX_DAYS - 1)
  const len = diffDays(from, to) + 1

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [picked, setPicked] = useState<Picked | null>(null)
  const [rangeNote, setRangeNote] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ['schedule', from, to],
    queryFn: () => api.schedule(from, to),
    placeholderData: keepPreviousData,
  })

  const setRange = (f: string, t: string, note: string | null = null) => {
    setPicked(null)
    setRangeNote(note)
    setParams(f === defFrom && t === defTo ? {} : { from: f, to: t })
  }
  const onFromChange = (v: string) => v && setRange(v, shift(v, len - 1))
  const onToChange = (v: string) => {
    if (!v) return
    if (v < from) return setRangeNote('Tanggal sampai tidak boleh sebelum tanggal dari.')
    if (v > shift(from, MAX_DAYS - 1)) return setRange(from, shift(from, MAX_DAYS - 1), `Maksimal ${MAX_DAYS} hari, tanggal sampai disesuaikan.`)
    setRange(from, v)
  }

  const barsByUnit = useMemo(() => {
    const m = new Map<string, { bars: Bar[]; lanes: number }>()
    data?.units.forEach((u) => m.set(u.unitId, buildBars(u)))
    return m
  }, [data])

  const typeOptions = useMemo<DropdownOption[]>(() => {
    const counts = new Map<string, number>()
    let total = 0
    for (const u of data?.units ?? []) {
      if (!showInactive && !u.active) continue
      const t = u.unitType || NO_TYPE
      counts.set(t, (counts.get(t) ?? 0) + 1)
      total++
    }
    const sorted = [...counts.entries()].sort(([a], [b]) => (a === NO_TYPE ? 1 : b === NO_TYPE ? -1 : a.localeCompare(b)))
    return [{ value: '', label: 'Semua tipe', hint: total }, ...sorted.map(([t, c]) => ({ value: t, label: t, hint: c }))]
  }, [data, showInactive])

  const groups = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const map = new Map<string, ScheduleUnit[]>()
    for (const u of data.units) {
      const type = u.unitType || NO_TYPE
      if (!showInactive && !u.active) continue
      if (typeFilter && type !== typeFilter) continue
      if (q && !u.unitId.toLowerCase().includes(q)) continue
      map.set(type, [...(map.get(type) ?? []), u])
    }
    return [...map.entries()].sort(([a], [b]) => (a === NO_TYPE ? 1 : b === NO_TYPE ? -1 : a.localeCompare(b)))
  }, [data, search, typeFilter, showInactive])

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
    const bar = barsByUnit.get(picked.unitId)?.bars.find((b) => b.key === picked.barKey)
    return unit && bar ? { unit, bar } : null
  }, [data, picked, barsByUnit])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  useLayoutEffect(() => {
    if (!picked || !popRef.current || isMobile) return setPos(null)
    const { offsetHeight: h, offsetWidth: w } = popRef.current
    const r = picked.rect
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
    let top = r.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6)
    setPos({ left, top })
  }, [picked, detail, isMobile])

  useEffect(() => {
    if (!picked) return
    const close = () => setPicked(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element
      if (!popRef.current?.contains(t) && !t.closest('[data-bar]')) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', close)
    }
  }, [picked])

  if (isPending) return <p className="p-8 text-slate-500">Memuat jadwal...</p>
  if (error || !data) return <p className="p-8 text-red-600">Gagal memuat jadwal. Coba muat ulang halaman.</p>

  const n = data.days.length
  const unitCol = isMobile ? UNIT_COL_MOBILE : UNIT_COL
  const cols = `${unitCol}px repeat(${n}, minmax(${DAY_COL}px, 1fr))`
  const cards: [string, number, string][] = [
    ['Work order', totals.wo, 'bg-blue-500'],
    ['Standby', totals.standby, 'bg-amber-500'],
    ['Maintenance', totals.maintenance, 'bg-rose-500'],
    ['Hari kosong', totals.kosong, 'bg-slate-300'],
  ]
  const inputClass = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500'

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-lg font-semibold text-slate-900">Jadwal unit</h1>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari unit, misalnya K-33" aria-label="Cari unit" className={`${inputClass} w-44`} />
        <Dropdown value={typeFilter} onChange={setTypeFilter} options={typeOptions} label="Filter tipe unit" />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Unit nonaktif
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <button aria-label="Rentang sebelumnya" onClick={() => setRange(shift(from, -len), shift(to, -len))} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">
          ‹
        </button>
        <label className="flex items-center gap-1.5">
          Dari
          <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-1.5">
          Sampai
          <input type="date" value={to} min={from} max={shift(from, MAX_DAYS - 1)} onChange={(e) => onToChange(e.target.value)} className={inputClass} />
        </label>
        <button aria-label="Rentang berikutnya" onClick={() => setRange(shift(from, len), shift(to, len))} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">
          ›
        </button>
        <button onClick={() => setRange(defFrom, defTo)} className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">
          Minggu ini
        </button>
        <span className={`text-xs text-slate-400 ${isFetching ? 'opacity-60' : ''}`}>{len} hari, maksimal {MAX_DAYS}</span>
        {rangeNote && (
          <span role="status" className="text-xs text-amber-700">
            {rangeNote}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, v, dot]) => (
          <div key={label} className="rounded-lg bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {label}
            </div>
            <div className="text-xl font-semibold text-slate-900">
              {v} <span className="text-xs font-normal text-slate-400">hari-unit</span>
            </div>
          </div>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg bg-white shadow-sm" onScroll={() => picked && setPicked(null)}>
        <div style={{ minWidth: unitCol + n * DAY_COL }}>
          <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: cols }}>
            <div className="sticky left-0 z-30 border-r border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Unit</div>
            {data.days.map((d) => {
              const wd = parseIso(d).getDay()
              return (
                <div key={d} className={`py-2 text-center text-xs ${wd === 0 || wd === 6 ? 'bg-slate-50' : ''} ${d === today ? 'font-medium text-blue-600 shadow-[inset_0_-2px_0_#2563eb]' : 'text-slate-500'}`}>
                  {WEEKDAY[wd]}
                  <br />
                  {shortDate(d)}
                </div>
              )
            })}
          </div>

          {groups.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Unit tidak ditemukan.</p>}

          {groups.map(([type, units]) => {
            const open = !closed[type]
            const kosong = units.reduce((s, u) => s + u.cells.filter((c) => kindsOf(c).length === 0).length, 0)
            return (
              <div key={type}>
                <div className="border-b border-slate-200 bg-slate-50">
                  <button onClick={() => setClosed((c) => ({ ...c, [type]: open }))} aria-expanded={open} className="sticky left-0 flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-900">
                    <span className="w-3 text-slate-400">{open ? '▾' : '▸'}</span>
                    {type}
                    <span className="text-xs font-normal text-slate-400">
                      {units.length} unit, {kosong} hari kosong
                    </span>
                  </button>
                </div>
                {open &&
                  units.map((u) => {
                    const { bars, lanes } = barsByUnit.get(u.unitId)!
                    const span = `1 / span ${lanes + 2}`
                    return (
                      <div key={u.unitId} className={`grid border-b border-slate-200 ${u.active ? '' : 'opacity-60'}`} style={{ gridTemplateColumns: cols, gridTemplateRows: `6px repeat(${lanes}, ${BAR_H}px) 6px`, rowGap: 2 }}>
                        <div className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900" style={{ gridColumn: 1, gridRow: span }}>
                          {u.unitId}
                          {!u.active && <div className="text-[11px] font-normal text-slate-400">nonaktif</div>}
                        </div>
                        {data.days.map((d, i) => {
                          const wd = parseIso(d).getDay()
                          return <div key={d} className={`border-l border-slate-100 ${wd === 0 || wd === 6 ? 'bg-slate-50' : ''}`} style={{ gridColumn: i + 2, gridRow: span }} />
                        })}
                        {bars.map((b) => {
                          const selected = picked?.unitId === u.unitId && picked.barKey === b.key
                          const cutL = b.kind === 'wo' && b.wo!.start < data.days[0]
                          const cutR = b.kind === 'wo' && b.wo!.finish > data.days[n - 1]
                          return (
                            <button
                              key={b.key}
                              data-bar
                              title={b.label}
                              onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect()
                                setPicked({ unitId: u.unitId, barKey: b.key, rect: { left: r.left, top: r.top, bottom: r.bottom } })
                              }}
                              className={`relative z-[1] mx-0.5 truncate border px-1.5 text-left text-[11px] leading-[20px] ${KIND_STYLE[b.kind]} ${cutL ? 'rounded-l-none border-l-0' : 'rounded-l'} ${cutR ? 'rounded-r-none border-r-0' : 'rounded-r'} ${selected ? 'outline outline-2 outline-offset-1 outline-slate-900' : ''}`}
                              style={{ gridColumn: `${b.start + 2} / ${b.end + 3}`, gridRow: b.lane + 2 }}
                            >
                              {cutL && '‹ '}
                              {b.label}
                              {cutR && ' ›'}
                              {b.conflict && <span title="Bentrok: work order dan maintenance di hari yang sama" className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-600" />}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
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
          Bentrok: work order dan maintenance di hari yang sama ({totals.bentrok} hari-unit)
        </span>
      </div>

      {picked && detail && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={`Detail ${detail.unit.unitId}`}
          className={`z-40 border border-slate-200 bg-white p-4 text-sm shadow-lg ${isMobile ? 'fixed inset-x-0 bottom-0 rounded-t-xl' : 'fixed w-80 rounded-lg'}`}
          style={isMobile ? undefined : { left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-slate-900">{detail.unit.unitId}</div>
              <div className="text-xs text-slate-500">{detail.unit.unitType ?? NO_TYPE}</div>
            </div>
            <button aria-label="Tutup" onClick={() => setPicked(null)} className="rounded px-2 text-lg leading-none text-slate-400 hover:bg-slate-100">
              ×
            </button>
          </div>
          <span className={`rounded border px-1.5 py-0.5 text-xs ${KIND_STYLE[detail.bar.kind]}`}>{KIND_LABEL[detail.bar.kind]}</span>
          <dl className="mt-3 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-slate-700">
            {detail.bar.kind === 'wo' && detail.bar.wo && (
              <>
                <dt className="text-slate-400">Tipe</dt>
                <dd>{detail.bar.wo.rcType ?? '-'}</dd>
                <dt className="text-slate-400">Lokasi</dt>
                <dd>{detail.bar.wo.location ? properCase(detail.bar.wo.location) : '-'}</dd>
                <dt className="text-slate-400">No. WO</dt>
                <dd className="break-all">{detail.bar.wo.id}</dd>
                {detail.bar.wo.rcId && (
                  <>
                    <dt className="text-slate-400">Kontrak</dt>
                    <dd className="break-all">{detail.bar.wo.rcId}</dd>
                  </>
                )}
                <dt className="text-slate-400">Periode</dt>
                <dd>
                  {detail.bar.wo.start === detail.bar.wo.finish ? fullDate(detail.bar.wo.start) : `${fullDate(detail.bar.wo.start)} – ${fullDate(detail.bar.wo.finish)}`}
                </dd>
              </>
            )}
            {detail.bar.kind === 'maintenance' && (
              <>
                <dt className="text-slate-400">Keterangan</dt>
                <dd>{detail.bar.remarks || 'Tanpa keterangan.'}</dd>
              </>
            )}
            {detail.bar.kind !== 'wo' && (
              <>
                <dt className="text-slate-400">Tanggal</dt>
                <dd>{detail.bar.start === detail.bar.end ? fullDate(data.days[detail.bar.start]) : `${fullDate(data.days[detail.bar.start])} – ${fullDate(data.days[detail.bar.end])}`}</dd>
              </>
            )}
          </dl>
          {detail.bar.conflict && <p className="mt-3 rounded bg-red-50 px-2 py-1 text-xs text-red-700">Bentrok: ada work order dan maintenance di hari yang sama.</p>}
        </div>
      )}
    </main>
  )
}
