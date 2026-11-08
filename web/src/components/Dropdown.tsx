import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export type DropdownOption = { value: string; label: string; hint?: string | number }

type Props = {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  label: string
  className?: string
}

// Dropdown kustom (listbox) yang bisa dipakai dengan mouse maupun keyboard.
export default function Dropdown({ value, onChange, options, label, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]

  const openList = () => {
    setActive(selectedIndex)
    setOpen(true)
  }
  const choose = (i: number) => {
    onChange(options[i].value)
    setOpen(false)
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
    const last = options.length - 1
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === 'Enter' || e.key === ' ') choose(active)
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false)
    else return
    if (e.key !== 'Tab') e.preventDefault()
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full min-w-44 items-center justify-between gap-2 rounded-lg border bg-white py-1.5 pl-3 pr-2 text-left text-sm shadow-sm outline-none transition-colors hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500/40 ${open ? 'border-blue-500' : 'border-slate-300'}`}
      >
        <span className={`truncate ${value ? 'font-medium text-slate-900' : 'text-slate-600'}`}>{selected?.label}</span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-50 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((o, i) => {
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
      )}
    </div>
  )
}
