import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, type WorkOrderCreated } from '../../api'
import Dropdown from '../../components/Dropdown'
import { Field, FormCard, Result, SubmitButton, UnitPicker, inputClass, readOnlyClass, shiftIso, todayIso, useFormOptions } from './shared'

type Errors = Partial<Record<'operator' | 'unit' | 'location' | 'start' | 'finish', string>>

export default function WorkOrderForm() {
  const { data: options } = useFormOptions()
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

  const operatorOptions = useMemo(() => (options?.operators ?? []).map((o) => ({ value: o.employeeId, label: o.name })), [options])
  const unitType = useMemo(() => options?.units.find((u) => u.unitId === unitId)?.unitType ?? '', [options, unitId])

  const rcTypeOptions = useMemo(() => (options?.rcTypes ?? []).map((t) => ({ value: t, label: t })), [options])

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

  const contractOptions = useMemo(
    () => [{ value: '', label: '(kosong)' }, ...(options?.contracts ?? []).map((c) => ({ value: c.rcId, label: c.rcId, hint: c.rcType ?? '' }))],
    [options],
  )

  const create = useMutation({
    mutationFn: () =>
      api.createWorkOrder({
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
      }),
    onSuccess: (r) => {
      setCreated(r)
      setOperatorId('')
      setUnitId('')
      setLocation('')
      setFinishDate('')
      touched.current = { time: false, volume: false, pipe: false }
      setRcId('')
      setRemarks('')
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

  return (
    <FormCard title="Buat Work Order" description="Mencatat work order baru untuk sebuah unit. Nomor WO dibuat otomatis.">
      {created && (
        <Result kind="success" linkFrom={created.startDate} linkTo={shiftIso(created.startDate, 6)}>
          <p>
            Work order <strong>{created.id}</strong> tersimpan untuk unit {created.unitId}.
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
            <UnitPicker value={unitId} onChange={setUnitId} />
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

        <div className="flex justify-end">
          <SubmitButton pending={create.isPending}>Simpan work order</SubmitButton>
        </div>
      </form>
    </FormCard>
  )
}
