import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type DayRecordCreated } from '../../api'
import { useCan } from '../../auth'
import { Field, FormCard, MAX_RANGE_DAYS, Result, SubmitButton, UnitPicker, daysBetween, inputClass, shiftIso, todayIso } from './shared'

type Kind = 'maintenance' | 'standby'

const TEXT: Record<Kind, { title: string; description: string; label: string; submit: string }> = {
  maintenance: {
    title: 'Buat Maintenance',
    description: 'Mencatat unit yang sedang maintenance. Satu catatan dibuat per hari, dan tidak bisa pada hari yang sudah ada work order.',
    label: 'Maintenance',
    submit: 'Simpan maintenance',
  },
  standby: {
    title: 'Buat Standby',
    description: 'Mencatat unit yang standby. Satu catatan dibuat per hari, dan tidak bisa pada hari yang sudah ada work order atau maintenance.',
    label: 'Standby',
    submit: 'Simpan standby',
  },
}

type Errors = Partial<Record<'unit' | 'start' | 'finish', string>>

export default function DayRecordForm({ kind }: { kind: Kind }) {
  const t = TEXT[kind]
  const qc = useQueryClient()
  const canView = useCan()(`${kind}:view`)
  const [unitId, setUnitId] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [finishDate, setFinishDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [created, setCreated] = useState<DayRecordCreated | null>(null)

  const create = useMutation({
    mutationFn: () => {
      const body = { unitId, startDate, finishDate: finishDate || undefined }
      return kind === 'maintenance' ? api.createMaintenance({ ...body, remarks: remarks.trim() || undefined }) : api.createStandby(body)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['day-records', kind] })
      setCreated(r)
      setUnitId('')
      setFinishDate('')
      setRemarks('')
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setCreated(null)
    const err: Errors = {}
    if (!unitId) err.unit = 'Pilih unit.'
    if (!startDate) err.start = 'Tanggal mulai wajib diisi.'
    if (startDate && finishDate && finishDate < startDate) err.finish = 'Tanggal selesai tidak boleh sebelum tanggal mulai.'
    if (startDate && finishDate && finishDate >= startDate && daysBetween(startDate, finishDate) > MAX_RANGE_DAYS) err.finish = `Rentang maksimal ${MAX_RANGE_DAYS} hari.`
    setErrors(err)
    if (Object.keys(err).length === 0) create.mutate()
  }

  return (
    <FormCard title={t.title} description={t.description}>
      {created && (
        <Result kind="success" linkFrom={created.startDate} linkTo={shiftIso(created.startDate, 6)}>
          <p>
            {t.label} tersimpan untuk unit <strong>{created.unitId}</strong>: {created.count} hari
            {created.startDate !== created.finishDate ? ` (${created.startDate} sampai ${created.finishDate})` : ` (${created.startDate})`}.
          </p>
        </Result>
      )}
      {create.error && <Result kind="error">{create.error.message}</Result>}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-4 shadow-sm sm:p-6" noValidate>
        <Field label="Unit" error={errors.unit}>
          <UnitPicker value={unitId} onChange={setUnitId} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal mulai" error={errors.start}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Tanggal selesai" optional error={errors.finish} hint={`Kosongkan kalau hanya satu hari. Maksimal ${MAX_RANGE_DAYS} hari.`}>
            <input type="date" value={finishDate} min={startDate} onChange={(e) => setFinishDate(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {kind === 'maintenance' && (
          <Field label="Keterangan" optional>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} maxLength={2000} placeholder="Contoh: Ganti oli dan servis rutin" className={inputClass} />
          </Field>
        )}

        <div className="flex items-center justify-end gap-3">
          {canView && (
            <Link to={`/schedule/${kind}`} className="text-sm text-slate-600 underline">
              Kembali ke daftar
            </Link>
          )}
          <SubmitButton pending={create.isPending}>{t.submit}</SubmitButton>
        </div>
      </form>
    </FormCard>
  )
}
