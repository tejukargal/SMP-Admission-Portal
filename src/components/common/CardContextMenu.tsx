import { useEffect, useRef } from 'react';

export interface CardContextMenuAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
}

interface CardContextMenuProps {
  x: number;
  y: number;
  header?: { title: string; subtitle?: string };
  actions: CardContextMenuAction[];
  onClose: () => void;
}

const MENU_WIDTH = 208;
const ACTION_HEIGHT = 30;
const HEADER_HEIGHT = 40;

const VARIANT_CLASS: Record<NonNullable<CardContextMenuAction['variant']>, string> = {
  default: 'text-gray-700 hover:bg-gray-50',
  accent: 'text-amber-600 hover:bg-amber-50',
  danger: 'text-red-600 hover:bg-red-50',
};

/** Shared right-click / long-press context menu shell for compact card grids. */
export function CardContextMenu({ x, y, header, actions, onClose }: CardContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const estimatedHeight = (header ? HEADER_HEIGHT : 0) + actions.length * ACTION_HEIGHT + 12;
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - estimatedHeight - 8);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        className="fixed z-50 rounded-xl border border-gray-100 bg-white py-1.5"
        style={{
          left: Math.max(left, 8),
          top: Math.max(top, 8),
          width: MENU_WIDTH,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {header && (
          <div className="px-3 py-1.5 border-b border-gray-50">
            <span className="text-[11px] font-semibold text-gray-800 truncate block">{header.title}</span>
            {header.subtitle && <span className="text-[10px] text-gray-400">{header.subtitle}</span>}
          </div>
        )}
        {actions.map((action) => (
          <button
            key={action.label}
            className={`w-full text-left px-3 py-[6px] text-[12px] font-semibold flex items-center gap-2 transition-colors duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASS[action.variant ?? 'default']}`}
            disabled={action.disabled}
            onClick={() => { action.onClick(); onClose(); }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}
