// Singkatan yang tetap ditulis kapital saat teks KAPITAL diubah ke huruf besar-kecil biasa.
// Tambahkan di sini kalau ada singkatan lain yang ikut berubah.
const ACRONYMS = new Set([
  'PT', 'CV', 'UD', 'PD', 'PP', 'KSO', 'JO', 'DKI', 'KM', 'TNI', 'BUMN',
  'KCBM', 'BSD', 'CAA', 'PIK', 'PKU', 'SCG', 'KVB', 'UPG', 'PSM', 'PCI', 'BMW', 'KS',
  'RS', 'RSUD', 'RT', 'RW', 'SD', 'SMP', 'SMA', 'SMAN', 'SMS',
  'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
])

// Mengubah "PROYEK PT. WIJAYA KARYA" menjadi "Proyek PT. Wijaya Karya".
// Kata yang sudah campuran atau huruf kecil (misalnya "Tbk") dibiarkan.
export function properCase(text: string): string {
  return text.replace(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g, (w) => {
    if (w !== w.toUpperCase() || w === w.toLowerCase()) return w
    if (ACRONYMS.has(w)) return w
    return w[0] + w.slice(1).toLowerCase()
  })
}

// Timestamp dari server berbentuk teks "YYYY-MM-DD HH:MM:SS..." atau ISO; tampilkan sampai menit.
export const formatTimestamp = (t: string | null) => (t ? t.replace('T', ' ').slice(0, 16) : '')

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
// "2026-11-09" -> "November, 09 2026" (mmmm, dd yyyy).
export const formatDate = (iso: string | null) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${MONTHS[Number(m[2]) - 1]}, ${m[3]} ${m[1]}` : (iso ?? '')
}

// Judul pemisah per tanggal mulai, mis. "Senin, 9 Nov 2026".
export const dayLabel = (iso: string | null) => {
  if (!iso) return 'Tanpa tanggal'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

