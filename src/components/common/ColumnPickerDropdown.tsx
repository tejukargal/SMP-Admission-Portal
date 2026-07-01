import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Student } from '../../types';
import { COLUMN_GROUPS, type ColumnDef } from '../../utils/studentColumns';

interface ColumnPickerDropdownProps {
  columns: ColumnDef[];
  selected: Set<keyof Student>;
  onChange: (next: Set<keyof Student>) => void;
}

export function ColumnPickerDropdown({ columns, selected, onChange }: ColumnPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    const menuWidth = 260;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    const maxHeight = window.innerHeight - rect.bottom - 16;
    menu.style.left = `${left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.width = `${menuWidth}px`;
    menu.style.maxHeight = `${Math.max(maxHeight, 200)}px`;
  }, [open]);

  function toggle(key: keyof Student) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  }

  function selectAll() { onChange(new Set(columns.map((c) => c.key))); }
  function clearAll() { onChange(new Set()); }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors shrink-0 ${
          selected.size > 0
            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
            : 'border-emerald-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50/50'
        }`}
      >
        <span className="truncate">Columns ({selected.size})</span>
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
          className="fixed z-[9999] bg-white border border-gray-200/80 rounded-2xl overflow-hidden flex flex-col"
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)',
          }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Select Columns</span>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 cursor-pointer">All</button>
              <span className="text-gray-200 text-[11px]">|</span>
              <button onClick={clearAll} className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 cursor-pointer">None</button>
            </div>
          </div>
          <div className="overflow-y-auto py-1">
            {COLUMN_GROUPS.map((group) => {
              const groupCols = columns.filter((c) => c.group === group);
              if (groupCols.length === 0) return null;
              return (
                <div key={group}>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider select-none">{group}</div>
                  {groupCols.map((col) => (
                    <label
                      key={col.key}
                      className="w-full flex items-center gap-2 px-3 py-[5px] text-[12px] text-gray-700 hover:bg-emerald-50/60 cursor-pointer transition-colors duration-100"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(col.key)}
                        onChange={() => toggle(col.key)}
                        className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
