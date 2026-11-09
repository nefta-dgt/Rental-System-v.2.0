// Satu sumber untuk menu: sidebar (menu utama), header (tab sub menu), dan penjaga rute membaca dari sini.
// Menambah menu atau sub menu cukup menambah satu baris.

type Can = (permission: string) => boolean

export type SubItem = {
  label: string
  /** Tujuan tab. Fungsi dipakai kalau tujuannya bergantung pada izin user. */
  to: string | ((can: Can) => string)
  /** Tab tampil jika user punya salah satu izin ini. Kosong = selalu tampil. */
  anyOf?: string[]
  /** Awalan path yang menandai tab ini aktif. Kosong = sama dengan tujuan. */
  match?: string
  /** Cocok hanya jika path persis sama (bukan awalan). */
  exact?: boolean
}

export type MenuItem = {
  key: string
  label: string
  /** Awalan path yang menandai bagian ini sedang aktif. */
  prefix?: string
  /** Belum tersedia: tampil abu-abu dengan label "Segera" dan tidak bisa diklik. */
  soon?: boolean
  children?: SubItem[]
}

export const MENU: MenuItem[] = [
  {
    key: 'schedule',
    label: 'Penjadwalan',
    prefix: '/schedule',
    children: [
      {
        label: 'Work Order',
        // Yang hanya boleh membuat langsung ke form; yang boleh melihat ke daftar.
        to: (can) => (can('work_order:view') ? '/schedule/work-order' : '/schedule/work-order/new'),
        anyOf: ['work_order:view', 'work_order:create'],
        match: '/schedule/work-order',
      },
      { label: 'Maintenance', to: '/schedule/maintenance', anyOf: ['maintenance:create'] },
      { label: 'Standby', to: '/schedule/standby', anyOf: ['standby:create'] },
    ],
  },
  { key: 'work-order', label: 'Work Order', soon: true },
  { key: 'timesheet', label: 'Timesheet', soon: true },
  { key: 'rent-contract', label: 'Rent Contract', soon: true },
  { key: 'timesheet-valuation', label: 'Timesheet Valuation', soon: true },
]

export const resolveTo = (s: SubItem, can: Can) => (typeof s.to === 'function' ? s.to(can) : s.to)

export const visibleTabs = (item: MenuItem, can: Can) =>
  (item.children ?? []).filter((s) => !s.anyOf || s.anyOf.some((p) => can(p)))

/** Menu utama yang ditampilkan: bagian dengan sub menu hanya muncul kalau ada tab yang boleh dibuka. */
export const visibleMenu = (can: Can) => MENU.filter((m) => m.soon || visibleTabs(m, can).length > 0)

export const activeSection = (pathname: string) =>
  MENU.find((m) => m.prefix && (pathname === m.prefix || pathname.startsWith(`${m.prefix}/`)))

export const sectionLanding = (item: MenuItem, can: Can) => {
  const first = visibleTabs(item, can)[0]
  return first ? resolveTo(first, can) : '/'
}

export function isTabActive(s: SubItem, pathname: string, can: Can) {
  const base = s.match ?? resolveTo(s, can)
  return s.exact ? pathname === base : pathname === base || pathname.startsWith(`${base}/`)
}
