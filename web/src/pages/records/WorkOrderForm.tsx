import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type WorkOrderCreated } from '../../api'
import { useCan } from '../../auth'
import Dropdown from '../../components/Dropdown'
import { Field, FormCard, Result, SubmitButton, UnitPicker, inputClass, readOnlyClass, shiftIso, todayIso, useFormOptions } from './shared'

type Errors = Partial<Record<'operator' | 'unit' | 'location' | 'start' | 'finish', string>>

// Form yang sama dipakai untuk membuat (/schedule/work-order) dan mengubah (/schedule/work-order/:id/edit).
export default function WorkOrderForm() {
  const { id } = useParams()
  const editing = !!id
  const can = useCan()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: options } = useFormOptions()
  const detail = useQuery({ queryKey: ['work-order', id], queryFn: () => api.getWorkOrder(id!), enabled: editing, staleTime: 0, gcTime: 0 })
  const current = detail.data
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [operatorId, setOperatorId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [rcType, setRcType] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [finishDate, setFinishDate] = useState('')
  const [qty, setQty] = useState('1')
  const [time, setTime] = useState('')
  const [volume, setVolume] = useState('')
  const [pipe, setPipe] = useState('')
  const [rcId, setRcId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [created, setCreated] = useState<WorkOrderCreated | null>(null)

  useEffect(() => {
    if (!rcType && options?.rcTypes.length) setRcType(options.rcTypes.includes('Retail') ? 'Retail' : options.rcTypes[0])
  }, [options, rcType])

  // Isi form dengan data WO yang diedit (sekali saja). Nilai time/volume/pipe tersimpan tidak ditimpa nilai default.
  const loaded = useRef(false)
  useEffect(() => {
    if (!current || loaded.current) return
    loaded.current = true
    touched.current = { time: true, volume: true, pipe: true }
    setOperatorId(current.operatorId ?? '')
    setUnitId(current.unitId ?? '')
    setRcType(current.rcType ?? '')
    setRcId(current.rcId ?? '')
    setLocation(current.location ?? '')
    setStartDate(current.startDate ?? '')
    setFinishDate(current.finishDate && current.finishDate !== current.startDate ? current.finishDate : '')
    setQty(current.qty == null ? '' : String(current.qty))
    setTime(current.time == null ? '' : String(current.time))
    setVolume(current.volume == null ? '' : String(current.volume))
    setPipe(current.pipe ?? '')
    setRemarks(current.remarks ?? '')
  }, [current])

  // Nilai yang sudah tersimpan tetap muncul di pilihan walau sudah tidak ada di daftar (operator nonaktif, tipe lama, kontrak lama).
  const operatorOptions = useMemo(() => {
    const list = (options?.operators ?? []).map((o) => ({ value: o.employeeId, label: o.name }))
    if (current?.operatorId && !list.some((o) => o.value === current.operatorId)) list.unshift({ value: current.operatorId, label: current.operatorName ?? current.operatorId })
    return list
  }, [options, current])
  const unitType = useMemo(
    () => options?.units.find((u) => u.unitId === unitId)?.unitType ?? (current && current.unitId === unitId ? (current.unitType ?? '') : ''),
    [options, unitId, current],
  )

  const rcTypeOptions = useMemo(() => {
    const list = (options?.rcTypes ?? []).map((t) => ({ value: t, label: t }))
    if (current?.rcType && !list.some((o) => o.value === current.rcType)) list.unshift({ value: current.rcType, label: current.rcType })
    return list
  }, [options, current])

  // Nilai awal time/volume/pipe dari unit_price_default (unit_type + tipe work order). Hanya menimpa kolom yang belum diubah user.
  const touched = useRef({ time: false, volume: false, pipe: false })
  const unitDefault = useMemo(
    () => (unitType ? options?.defaults.find((d) => d.rcType === rcType && d.unitType.toLowerCase() === unitType.toLowerCase()) : undefined),
    [options, unitType, rcType],
  )
  useEffect(() => {
    const str = (n: number | null | undefined) => (n == null ? '' : String(n))
    if (!touched.current.time) setTime(str(unitDefault?.time))
    if (!touched.current.volume) setVolume(str(unitDefault?.volume))
    if (!touched.current.pipe) setPipe(str(unitDefault?.pipe))
  }, [unitDefault])

  const contractOptions = useMemo(() => {
    const list = (options?.contracts ?? []).map((c) => ({ value: c.rcId, label: c.rcId, hint: c.rcType ?? '' }))
    if (current?.rcId && !list.some((o) => o.value === current.rcId)) list.unshift({ value: current.rcId, label: current.rcId, hint: '' })
    return [{ value: '', label: '(kosong)' }, ...list]
  }, [options, current])

  const create = useMutation({
    mutationFn: () => {
      const body = {
        operatorId,
        unitId,
        rcType,
        location: location.trim(),
        startDate,
        finishDate: finishDate || undefined,
        qty: qty === '' ? undefined : Number(qty),
        time: time === '' ? undefined : Number(time),
        volume: volume === '' ? undefined : Number(volume),
        pipe: pipe.trim() || undefined,
        remarks: remarks.trim() || undefined,
        rcId: rcId || undefined,
      }
      return editing ? api.updateWorkOrder(id!, body) : api.createWorkOrder(body)
    },
    onSuccess: (r) => {
      setCreated(r)
      if (editing) {
        queryClient.invalidateQueries({ queryKey: ['work-orders'] })
        return
      }
      setOperatorId('')
      setUnitId('')
      setLocation('')
      setFinishDate('')
      touched.current = { time: false, volume: false, pipe: false }
      setRcId('')
      setRemarks('')
    },
  })

  const remove = useMutation({
    mutationFn: () => api.deleteWorkOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] })
      navigate('/schedule/work-order/list', { replace: true, state: { deleted: id } })
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setCreated(null)
    const err: Errors = {}
    if (!operatorId) err.operator = 'Pilih operator.'
    if (!unitId) err.unit = 'Pilih unit.'
    if (!location.trim()) err.location = 'Lokasi wajib diisi.'
    if (!startDate) err.start = 'Tanggal mulai wajib diisi.'
    if (startDate && finishDate && finishDate < startDate) err.finish = 'Tanggal selesai tidak boleh sebelum tanggal mulai.'
    setErrors(err)
    if (Object.keys(err).length === 0) create.mutate()
  }

  if (editing && detail.isPending) return <FormCard title="Ubah Work Order" description="Memuat data...">{null}</FormCard>
  if (editing && detail.error)
    return (
      <FormCard title="Ubah Work Order" description="">
        <Result kind="error">{detail.error.message}</Result>
        <Link to="/schedule/work-order/list" className="text-sm font-medium text-blue-700 underline">
          Kembali ke daftar
        </Link>
      </FormCard>
    )

  return (
    <FormCard
      title={editing ? `Ubah Work Order ${id}` : 'Buat Work Order'}
      description={editing ? 'Mengubah data work order. Nomor WO tidak bisa diubah.' : 'Mencatat work order baru untuk sebuah unit. Nomor WO dibuat otomatis.'}
    >
      {created && (
        <Result kind="success" linkFrom={created.startDate} linkTo={shiftIso(created.startDate, 6)}>
          <p>
            Work order <strong>{created.id}</strong> {editing ? 'diperbarui' : 'tersimpan'} untuk unit {created.unitId}.
          </p>
          {created.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-800">
              {created.warnings.map((w) => (
                <li key={w}>Perhatian: {w}</li>
              ))}
            </ul>
          )}
        </Result>
      )}
      {create.error && <Result kind="error">{create.error.message}</Result>}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-4 shadow-sm sm:p-6" noValidate>
        <Field label="Operator" error={errors.operator}>
          <Dropdown value={operatorId} onChange={setOperatorId} label="Operator" options={operatorOptions} placeholder={options ? 'Pilih operator' : 'Memuat operator...'} searchable />
        </Field>

        <Field label="Tipe Work Order">
          <Dropdown value={rcType} onChange={setRcType} label="Tipe work order" options={rcTypeOptions} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit" error={errors.unit}>
            <UnitPicker value={unitId} onChange={setUnitId} current={current?.unitId ? { unitId: current.unitId, unitType: current.unitType } : undefined} />
          </Field>
          <Field label="Unit type" hint="Otomatis dari unit.">
            <input value={unitType} readOnly tabIndex={-1} placeholder="-" className={readOnlyClass} />
          </Field>
        </div>

        <Field label="RC id" optional>
          <Dropdown value={rcId} onChange={setRcId} label="RC id" options={contractOptions} searchable />
        </Field>

        <Field label="Location" error={errors.location}>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Contoh: Proyek Cilegon" maxLength={500} className={inputClass} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal mulai" error={errors.start}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Tanggal selesai" optional error={errors.finish} hint="Kosongkan kalau hanya satu hari.">
            <input type="date" value={finishDate} min={startDate} onChange={(e) => setFinishDate(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Qty">
            <input type="number" min={0} max={999} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Time" optional>
            <input type="number" min={0} step={1} value={time} onChange={(e) => { touched.current.time = true; setTime(e.target.value) }} className={inputClass} />
          </Field>
          <Field label="Volume" optional>
            <input type="number" min={0} step="any" value={volume} onChange={(e) => { touched.current.volume = true; setVolume(e.target.value) }} className={inputClass} />
          </Field>
          <Field label="Pipe" optional>
            <input value={pipe} onChange={(e) => { touched.current.pipe = true; setPipe(e.target.value) }} placeholder="10" maxLength={100} className={inputClass} />
          </Field>
        </div>

        <Field label="Remarks" optional>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} maxLength={2000} className={inputClass} />
        </Field>

        {remove.error && <Result kind="error">{remove.error.message}</Result>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {editing && can('work_order:delete') &&
              (confirmDelete ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-red-700">Hapus {id}? Tidak bisa dibatalkan.</span>
                  <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60">
                    {remove.isPending ? 'Menghapus...' : 'Ya, hapus'}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                    Batal
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                  Hapus
                </button>
              ))}
          </div>
          <div className="flex items-center gap-3">
            {editing && (
              <Link to="/schedule/work-order/list" className="text-sm text-slate-600 underline">
                Kembali ke daftar
              </Link>
            )}
            <SubmitButton pending={create.isPending}>{editing ? 'Simpan perubahan' : 'Simpan work order'}</SubmitButton>
          </div>
        </div>
      </form>
    </FormCard>
  )
}
