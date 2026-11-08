import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export type DropdownOption = { value: string; label: string; hint?: string | number }

type Props = {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  label: string
  placeholder?: string
  searchable?: boolean
  className?: string
}

// Dropdown kustom (listbox) yang bisa dipakai dengan mouse maupun keyboard.
// Dengan searchable, ada kolom cari di atas daftar (berguna untuk daftar panjang seperti unit).
export default function Dropdown({ value, onChange, options, label, placeholder = 'Pilih', searchable = false, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!searchable || !q) return options
    return options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q))
  }, [options, query, searchable])

  const selected = options.find((o) => o.value === value)

  const openList = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }
  const choose = (i: number) => {
    const o = shown[i]
    if (!o) return
    onChange(o.value)
    close()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    const last = Math.max(0, shown.length - 1)
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
    else if (e.key === 'Enter') choose(active)
    else if (e.key === 'Escape') close()
    else if (e.key === 'Tab') close(false)
    else if (!searchable && e.key === 'Home') setActive(0)
    else if (!searchable && e.key === 'End') setActive(last)
    else if (!searchable && e.key === ' ') choose(active)
    else return
    if (e.key !== 'Tab') e.preventDefault()
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && shown[active] ? `${id}-${active}` : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full min-w-44 items-center justify-between gap-2 rounded-lg border bg-white py-1.5 pl-3 pr-2 text-left text-sm shadow-sm outline-none transition-colors hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500/40 ${open ? 'border-blue-500' : 'border-slate-300'}`}
      >
        <span className={`truncate ${selected && selected.value ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Cari..."
              aria-label={`Cari ${label}`}
              role="searchbox"
              className="w-full border-b border-slate-200 px-3 py-2 text-sm outline-none"
            />
          )}
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="max-h-64 overflow-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Tidak ditemukan</li>}
            {shown.map((o, i) => {
              const isSelected = o.value === value
              return (
                <li
                  key={o.value}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${i === active ? 'bg-slate-100' : ''} ${isSelected ? 'font-medium text-blue-700' : 'text-slate-700'}`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {isSelected && (
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint !== undefined && <span className="text-xs tabular-nums text-slate-400">{o.hint}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
