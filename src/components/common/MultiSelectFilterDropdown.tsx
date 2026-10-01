import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface MultiSelectFilterDropdownProps<T extends string> {
  value: T[];
  onChange: (v: T[]) => void;
  placeholder: string;
  options: Option<T>[];
  className?: string;
  /** Accent colour; defaults to the app's emerald. */
  tone?: 'emerald' | 'indigo' | 'pea' | 'ocean' | 'cyan';
}

const TONES = {
  emerald: {
    ring: 'focus:ring-emerald-400',
    active: 'border-emerald-400 bg-emerald-50 text-emerald-700',
    idle: 'border-emerald-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50/50',
    allRow: 'text-emerald-700 bg-emerald-50/60',
    checkedRow: 'text-emerald-700 bg-emerald-50',
    checkbox: 'border-emerald-500 bg-emerald-500',
    font: '',
  },
  indigo: {
    ring: 'focus:ring-indigo-400',
    active: 'border-indigo-400 bg-indigo-50 text-indigo-700',
    idle: 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50',
    allRow: 'text-indigo-700 bg-indigo-50/60',
    checkedRow: 'text-indigo-700 bg-indigo-50',
    checkbox: 'border-indigo-500 bg-indigo-500',
    font: '',
  },
  // Pea / pistachio green — WP Students revamp (student-portal look).
  pea: {
    ring: 'focus:ring-[#5B9A2F]/40',
    active: 'border-[#5B9A2F] bg-[#F1F7EA] text-[#3F6E1F]',
    idle: 'border-[#CFE3BD] text-[#3F4654] hover:border-[#5B9A2F]/60 hover:bg-[#F6FAF1]',
    allRow: 'text-[#3F6E1F] bg-[#F1F7EA]/60',
    checkedRow: 'text-[#3F6E1F] bg-[#F1F7EA]',
    checkbox: 'border-[#5B9A2F] bg-[#5B9A2F]',
    font: 'font-wp',
  },
  // Ocean blue — Students revamp (student-portal look).
  ocean: {
    ring: 'focus:ring-[#0B7BC0]/40',
    active: 'border-[#0B7BC0] bg-[#EEF6FC] text-[#075E93]',
    idle: 'border-[#0B7BC0]/30 text-[#075E93] hover:border-[#0B7BC0]/55 hover:bg-[#F3F9FD]',
    allRow: 'text-[#075E93] bg-[#EEF6FC]/60',
    checkedRow: 'text-[#075E93] bg-[#EEF6FC]',
    checkbox: 'border-[#0B7BC0] bg-[#0B7BC0]',
    font: 'font-wp',
  },
  // Sky / cyan — Student Messages revamp (student-portal look).
  cyan: {
    ring: 'focus:ring-[#0891B2]/40',
    active: 'border-[#0891B2] bg-[#ECF7FA] text-[#0E6A85]',
    idle: 'border-[#0891B2]/30 text-[#0E6A85] hover:border-[#0891B2]/55 hover:bg-[#F3FAFC]',
    allRow: 'text-[#0E6A85] bg-[#ECF7FA]/60',
    checkedRow: 'text-[#0E6A85] bg-[#ECF7FA]',
    checkbox: 'border-[#0891B2] bg-[#0891B2]',
    font: 'font-wp',
  },
} as const;

export function MultiSelectFilterDropdown<T extends string>({
  value,
  onChange,
  placeholder,
  options,
  className = '',
  tone = 'emerald',
}: MultiSelectFilterDropdownProps<T>) {
  const t = TONES[tone];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const label = value.length === 0
    ? placeholder
    : value.length === 1
      ? options.find((o) => o.value === value[0])?.label ?? placeholder
      : `${value.length} selected`;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current;
    const menuWidth = Math.max(rect.width, 140);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.minWidth = `${menuWidth}px`;
  }, [open]);

  function toggleValue(v: T) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium bg-white focus:outline-none focus:ring-1 ${t.ring} cursor-pointer transition-colors shrink-0 ${
          value.length > 0 ? t.active : t.idle
        } ${className}`}
      >
        <span className="truncate">{label}</span>
        <svg
          width="9" height="9" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className={`fixed z-[9999] bg-white border border-gray-200/80 rounded-2xl overflow-hidden py-1 ${t.font}`}
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)',
          }}
        >
          {/* "All" / clear-all option */}
          <button
            className={`w-full text-left px-3 py-[5px] text-[12px] flex items-center gap-2 transition-colors duration-100 ${
              value.length === 0 ? t.allRow : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
            }`}
            onClick={() => { onChange([]); setOpen(false); }}
          >
            <span className="w-3 h-3 flex items-center justify-center shrink-0">
              {value.length === 0 && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            {placeholder}
          </button>
          <div className="my-0.5 h-px bg-gray-100 mx-2.5" />
          {options.map((opt) => {
            const checked = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                className={`w-full text-left px-3 py-[5px] text-[12px] flex items-center gap-2 transition-colors duration-100 ${
                  checked ? t.checkedRow : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                onClick={() => toggleValue(opt.value)}
              >
                <span className={`w-3 h-3 flex items-center justify-center shrink-0 rounded-[3px] border ${checked ? t.checkbox : 'border-gray-300'}`}>
                  {checked && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
