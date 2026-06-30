import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface FilterDropdownProps<T extends string> {
  value: T | '';
  onChange: (v: T | '') => void;
  placeholder: string;
  options: Option<T>[];
  className?: string;
}

export function FilterDropdown<T extends string>({
  value,
  onChange,
  placeholder,
  options,
  className = '',
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors shrink-0 ${
          value
            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
            : 'border-emerald-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50/50'
        } ${className}`}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
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
          className="fixed z-[9999] bg-white border border-gray-200/80 rounded-2xl overflow-hidden py-1"
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)',
          }}
        >
          {/* "All" / clear option */}
          <button
            className={`w-full text-left px-3 py-[5px] text-[12px] flex items-center gap-2 transition-colors duration-100 ${
              !value ? 'text-emerald-700 bg-emerald-50/60' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
            }`}
            onClick={() => { onChange('' as T | ''); setOpen(false); }}
          >
            <span className="w-3 h-3 flex items-center justify-center shrink-0">
              {!value && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            {placeholder}
          </button>
          <div className="my-0.5 h-px bg-gray-100 mx-2.5" />
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`w-full text-left px-3 py-[5px] text-[12px] flex items-center gap-2 transition-colors duration-100 ${
                value === opt.value
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span className="w-3 h-3 flex items-center justify-center shrink-0">
                {value === opt.value && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              {opt.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
