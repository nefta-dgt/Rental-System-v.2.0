import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Dropdown from '../../components/Dropdown'
import { api, type ApprovalDetail } from '../../api'
import { useCan } from '../../auth'
import { formatDate, properCase } from '../../text'
import { Result, inputClass, readOnlyClass } from '../records/shared'

const CREW_SLOTS = 4

const minutesOf = (v: string) => {
  const m = v.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
// Selisih dua jam dalam jam desimal; melewati tengah malam ditambah 24 jam (sama dengan v1).
const hoursBetween = (from: string, to: string, factor = 1) => {
  const a = minutesOf(from)
  const b = minutesOf(to)
  if (a === null || b === null) return ''
  return String(Math.round(((((b - a) % 1440) + 1440) % 1440 / 60) * factor * 100) / 100)
}

function Cell({ label, span = 1, children }: { label: string; span?: 1 | 2 | 4; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${span === 4 ? 'col-span-full' : span === 2 ? 'col-span-2' : ''}`}>
      <label className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
      {children}
    </div>
  )
}
const Section = ({ title }: { title: string }) => (
  <div className="col-span-full mt-4">
    <h3 className="border-b pb-2 text-lg font-bold text-slate-900">{title}</h3>
  </div>
)

// Jam HH:MM: hanya angka, titik dua disisipkan otomatis.
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      inputMode="numeric"
      maxLength={5}
      placeholder="HH:MM"
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 4)
        onChange(d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d)
      }}
      className={inputClass}
    />
  )
}

// Susunan form sama dengan Review Document di v1: gambar di kiri, form di kanan.
export default function ApprovalDetailPage() {
  const { id = '' } = useParams()
  const detail = useQuery({ queryKey: ['approval', id], queryFn: () => api.getApproval(id) })
  if (detail.isPending) return <main className="p-6 text-slate-500">Memuat...</main>
  if (detail.error || !detail.data)
    return (
      <main className="p-6">
        <Result kind="error">{detail.error?.message ?? 'Gagal memuat'}</Result>
      </main>
    )
  return <Review id={id} d={detail.data} />
}

function Review({ id, d }: { id: string; d: ApprovalDetail }) {
  const can = useCan()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const f = d.fields
  const p = d.prefill

  const [tsNo, setTsNo] = useState(f.tsNo ?? '')
  const [operatorId, setOperatorId] = useState(d.suggested.operatorId ?? '')
  const [unitId, setUnitId] = useState(d.resolved.unitId ?? '')
  const [date, setDate] = useState(p.date)
  const [status, setStatus] = useState('Work')
  const [volume, setVolume] = useState(p.volume)
  const [pipe, setPipe] = useState(f.pipe ?? '')
  const [dispatch, setDispatch] = useState(p.dispatch)
  const [arrive, setArrive] = useState(p.arrive)
  const [start, setStart] = useState(p.start)
  const [finish, setFinish] = useState(p.finish)
  const [returnTime, setReturnTime] = useState(p.returnTime)
  const [distance, setDistance] = useState('')
  const [customer, setCustomer] = useState(f.customer ?? '')
  const [location, setLocation] = useState(f.location ?? '')
  const [batchingPlant, setBatchingPlant] = useState(f.batchingPlant ?? '')
  const [notes, setNotes] = useState(f.notes ?? '')
  const [crew, setCrew] = useState<string[]>(Array.from({ length: CREW_SLOTS }, (_, i) => d.suggested.crewIds[i] ?? ''))
  const [woId, setWoId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)

  const pending = d.status === 'PENDING'
  const canApprove = can('timesheet:approve') && pending

  // Work order mengikuti unit dan tanggal yang sedang diisi (periode WO harus mencakup tanggal).
  const wos = useQuery({
    queryKey: ['approval-wo', unitId, date],
    queryFn: () => api.listApprovalWorkOrders(unitId, date),
    enabled: !!unitId && /^\d{4}-\d{2}-\d{2}$/.test(date),
    initialData: unitId === (d.resolved.unitId ?? '') && date === p.date ? { items: d.workOrders } : undefined,
  })
  const woList = wos.data?.items ?? []
  useEffect(() => {
    if (wos.isFetching) return
    if (woId && !woList.some((w) => w.id === woId)) setWoId('')
    else if (!woId && woList.length === 1) setWoId(woList[0].id)
  }, [woList, woId, wos.isFetching])

  const unitType = d.units.find((u) => u.unitId === unitId)?.unitType ?? ''
  const totalTime = hoursBetween(start, finish)
  const totalJourney = hoursBetween(dispatch, arrive, 2)
  const crewById = useMemo(() => new Map(d.crew.map((c) => [c.employeeId, c])), [d.crew])
  const linked = woList.find((w) => w.id === woId)

  const done = () => {
    qc.invalidateQueries({ queryKey: ['approvals'] })
    qc.invalidateQueries({ queryKey: ['approval', id] })
  }
  const approve = useMutation({
    mutationFn: () =>
      api.approveTimesheet(id, {
        woId, tsNo: tsNo.trim(), operatorId, unitId, date, status, volume: Number(volume), pipe: pipe.trim(), dispatch, arrive, start, finish, returnTime,
        distanceKm: distance.trim() === '' ? null : Number(distance.replace(',', '.')), customer: customer.trim(), location: location.trim(),
        batchingPlant: batchingPlant.trim(), notes: notes.trim(), crewIds: crew.filter(Boolean),
      }),
    onSuccess: () => {
      done()
      navigate('/timesheet/approval')
    },
  })
  const decline = useMutation({
    mutationFn: () => api.declineTimesheet(id),
    onSuccess: () => {
      done()
      navigate('/timesheet/approval')
    },
  })

  const onApprove = () => {
    const bad =
      !tsNo.trim() ? 'Nomor timesheet wajib diisi.'
      : !operatorId ? 'Operator wajib dipilih.'
      : !unitId ? 'Unit wajib dipilih.'
      : !date ? 'Tanggal wajib diisi.'
      : volume.trim() === '' || Number.isNaN(Number(volume)) ? 'Total volume wajib diisi (angka).'
      : minutesOf(start) === null || minutesOf(finish) === null ? 'Start dan Finish wajib diisi (HH:MM).'
      : [dispatch, arrive, returnTime].some((t) => t !== '' && minutesOf(t) === null) ? 'Format jam harus HH:MM.'
      : distance.trim() !== '' && Number.isNaN(Number(distance.replace(',', '.'))) ? 'Jarak harus berupa angka.'
      : !woId ? 'Pilih work order.'
      : null
    setError(bad)
    if (!bad) approve.mutate()
  }

  const operatorOptions = d.operators.map((o) => ({ value: o.employeeId, label: properCase(o.name) }))
  const unitOptions = d.units.map((u) => ({ value: u.unitId, label: u.unitId, hint: u.unitType ?? '' }))
  const statusOptions = d.statuses.map((s) => ({ value: s, label: s }))
  const woOptions = woList.map((w) => ({ value: w.id, label: w.id, hint: `${formatDate(w.start)} - ${formatDate(w.finish)}${w.hasTimesheetThatDay ? ' (sudah ada timesheet hari itu)' : ''}` }))
  const crewOptions = (slot: number) => d.crew.filter((c) => c.employeeId === crew[slot] || !crew.includes(c.employeeId)).map((c) => ({ value: c.employeeId, label: properCase(c.name) }))
  const setSlot = (slot: number, v: string) => setCrew(crew.map((c, i) => (i === slot ? v : c)))
  const imageUrl = `/api/timesheet-approvals/${encodeURIComponent(id)}/image`
  const doubtful = (d.doubtfulFields ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  return (
    <main className="p-4 sm:p-6">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Review Document</h1>
            <p className="text-sm text-slate-500">
              OCR {d.confidence === null ? '-' : `${Math.round(d.confidence * 100)}%`}
              {doubtful.length > 0 && <span className="text-amber-700"> · ragu: {doubtful.join(', ')}</span>}
              {!pending && <span> · {d.status === 'APPROVED' ? 'sudah di-approve' : 'sudah di-decline'}</span>}
            </p>
          </div>
          <Link to="/timesheet/approval" aria-label="Tutup" className="text-3xl leading-none text-slate-500 hover:text-red-500">
            ×
          </Link>
        </div>

        <div className="md:flex">
          <div className="bg-slate-100 p-4 md:w-[45%] md:p-6">
            <div className="md:sticky md:top-4 md:max-h-[calc(100vh-8rem)] md:overflow-auto">
              {d.hasImage && !imageFailed ? (
                <a href={imageUrl} target="_blank" rel="noreferrer">
                  <img src={imageUrl} alt={`Timesheet ${f.tsNo ?? ''}`} onError={() => setImageFailed(true)} className="w-full rounded-xl shadow" />
                </a>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  {d.hasImage ? 'File gambar tidak ditemukan di server (cek UPLOADS_DIR).' : 'Tidak ada gambar.'}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4 md:w-[55%] md:p-8">
            {(error || approve.error || decline.error) && <Result kind="error">{error ?? (approve.error ?? decline.error)!.message}</Result>}

            <div className="grid grid-cols-2 gap-5 min-[1280px]:grid-cols-4">
              <div className="col-span-full rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Work Order</div>
                <div className="mt-2">
                  <Dropdown className="[&>button]:min-w-0" value={woId} onChange={setWoId} options={woOptions} label="Work order" placeholder="Pilih work order" />
                </div>
                <p className={`mt-2 text-sm ${linked ? 'text-slate-700' : 'text-slate-400'}`}>
                  {linked ? `Periode ${formatDate(linked.start)} sampai ${formatDate(linked.finish)}` : woList.length ? 'Belum dipilih' : 'Tidak ada work order untuk unit dan tanggal ini'}
                </p>
              </div>

              <Section title="Timesheet Detail" />
              <Cell label="TS No">
                <input value={tsNo} onChange={(e) => setTsNo(e.target.value)} maxLength={100} className={inputClass} />
              </Cell>
              <Cell label="Operator">
                <Dropdown className="[&>button]:min-w-0" value={operatorId} onChange={setOperatorId} options={operatorOptions} label="Operator" placeholder="-- Pilih Operator --" searchable />
              </Cell>
              <Cell label="Unit ID">
                <Dropdown className="[&>button]:min-w-0" value={unitId} onChange={setUnitId} options={unitOptions} label="Unit ID" placeholder="-- Pilih Unit --" searchable />
              </Cell>
              <Cell label="Unit Type">
                <input readOnly value={unitType} placeholder="-- Otomatis dari Unit ID --" className={readOnlyClass} />
              </Cell>
              <Cell label="Date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </Cell>
              <Cell label="Status">
                <Dropdown className="[&>button]:min-w-0" value={status} onChange={setStatus} options={statusOptions} label="Status" />
              </Cell>
              <Cell label="Total Volume">
                <input value={volume} inputMode="decimal" onChange={(e) => setVolume(e.target.value.replace(',', '.'))} className={inputClass} />
              </Cell>
              <Cell label="Pipe Used">
                <input value={pipe} onChange={(e) => setPipe(e.target.value)} maxLength={100} className={inputClass} />
              </Cell>
              <Cell label="Dispatch"><TimeInput value={dispatch} onChange={setDispatch} /></Cell>
              <Cell label="Arrive"><TimeInput value={arrive} onChange={setArrive} /></Cell>
              <Cell label="Start"><TimeInput value={start} onChange={setStart} /></Cell>
              <Cell label="Finish"><TimeInput value={finish} onChange={setFinish} /></Cell>
              <Cell label="Return"><TimeInput value={returnTime} onChange={setReturnTime} /></Cell>
              <Cell label="Distance (km)">
                <input value={distance} inputMode="decimal" placeholder="0.00" onChange={(e) => setDistance(e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''))} className={inputClass} />
              </Cell>
              <Cell label="Total Journey">
                <input readOnly value={totalJourney} placeholder="-- Otomatis dari Dispatch & Arrive --" className={readOnlyClass} />
              </Cell>
              <Cell label="Total Time">
                <input readOnly value={totalTime} placeholder="-- Otomatis dari Start & Finish --" className={readOnlyClass} />
              </Cell>

              <Section title="Additional Details" />
              <Cell label="Perusahaan" span={2}>
                <input readOnly value={f.company ?? ''} title="Tidak disimpan ke timesheet (sama dengan v1)" className={readOnlyClass} />
              </Cell>
              <Cell label="Nama Customer" span={2}>
                <input value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={500} className={inputClass} />
              </Cell>
              <Cell label="Lokasi Proyek" span={2}>
                <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={500} className={inputClass} />
              </Cell>
              <Cell label="PIC Proyek" span={2}>
                <input readOnly value={f.pic ?? ''} title="Tidak disimpan ke timesheet (sama dengan v1)" className={readOnlyClass} />
              </Cell>
              <Cell label="Phone" span={2}>
                <input readOnly value={f.phone ?? ''} title="Tidak disimpan ke timesheet (sama dengan v1)" className={readOnlyClass} />
              </Cell>
              <Cell label="Batching Plant" span={2}>
                <input value={batchingPlant} onChange={(e) => setBatchingPlant(e.target.value)} maxLength={200} className={inputClass} />
              </Cell>

              <Section title="Concrete Pump Crew" />
              {crew.map((c, i) => (
                <div key={i} className="col-span-full grid grid-cols-2 gap-5">
                  <Cell label={`Crew ${i + 1}`}>
                    <Dropdown className="[&>button]:min-w-0" value={c} onChange={(v) => setSlot(i, v)} options={crewOptions(i)} label={`Crew ${i + 1}`} placeholder="-- Pilih Crew --" searchable />
                  </Cell>
                  <Cell label={`KTP Crew ${i + 1}`}>
                    <input readOnly value={crewById.get(c)?.nik ?? ''} placeholder="-- Otomatis dari Crew --" className={readOnlyClass} />
                  </Cell>
                </div>
              ))}
            </div>

            <Cell label="Catatan" span={4}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={2000} className={inputClass} />
            </Cell>

            <div className="mt-6 grid grid-cols-3 gap-4">
              <Link to="/timesheet/approval" className="rounded-xl bg-slate-200 py-3 text-center text-lg text-slate-800 hover:bg-slate-300">
                Cancel
              </Link>
              <button
                type="button"
                disabled={!canApprove || decline.isPending}
                onClick={() => window.confirm('Decline timesheet ini? Statusnya menjadi REJECTED.') && decline.mutate()}
                className="rounded-xl bg-red-600 py-3 text-lg text-white hover:bg-red-700 disabled:opacity-40"
              >
                Decline
              </button>
              <button type="button" disabled={!canApprove || approve.isPending} onClick={onApprove} className="rounded-xl bg-green-600 py-3 text-lg text-white hover:bg-green-700 disabled:opacity-40">
                {approve.isPending ? 'Menyimpan...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
