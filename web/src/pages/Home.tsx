import { useMe } from '../auth'

export default function Home() {
  const { data: me } = useMe()
  if (!me) return null
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
