import { useCan, useMe } from '../auth'
import Schedule from './Schedule'

// Beranda = jadwal unit (sorotan utama). User tanpa izin schedule:view melihat halaman sambutan.
export default function Home() {
  const { data: me } = useMe()
  const can = useCan()
  if (!me) return null
  if (can('schedule:view')) return <Schedule />
  const allAccess = me.sections.includes('*')

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-lg font-semibold text-slate-900">Selamat datang, {me.name}</h1>
      <p className="mb-4 text-sm text-slate-600">
        {allAccess ? 'Akses penuh ke semua bagian.' : 'Bagian yang boleh Anda akses:'}
      </p>
      {!allAccess && (
        <ul className="list-disc pl-5 text-sm text-slate-700">
          {me.sections.length === 0 && <li>Belum ada akses. Hubungi admin.</li>}
          {me.sections.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </main>
  )
}
