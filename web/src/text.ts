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
