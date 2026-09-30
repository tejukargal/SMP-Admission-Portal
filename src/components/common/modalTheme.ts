import { createContext, useContext } from 'react';

/** Accent + payment-status colours for the shared fee/student modals.
 *  The default theme equals the colours the modals always used, so pages that
 *  don't pass a theme (Students, Admissions, WP Students, Collect Fee) are unchanged. */
export interface ModalTheme {
  /** Modal identity colour (was OCEAN in StudentDetailModal, TEAL in FeeCollectionModal). */
  accent: string;
  /** Darker shade of the accent, for text on light backgrounds. */
  accentInk: string;
  /** Paid / cleared / No Dues. */
  paid: string;
  /** Due / outstanding. */
  due: string;
  /** Refund pending. */
  refund: string;
  /** When true, "due" chips render as a solid fill with white text (emphasis by weight, not hue). */
  solidDue: boolean;
}

export type ModalThemeName = 'default' | 'periwinkle';

export const STUDENT_DEFAULT_THEME: ModalTheme = {
  accent: '#0B7BC0', accentInk: '#075E93', paid: '#0FA968', due: '#E11D48', refund: '#E11D48', solidDue: false,
};

export const FEE_DEFAULT_THEME: ModalTheme = {
  accent: '#0F8B8D', accentInk: '#0B6567', paid: '#0FA968', due: '#E11D48', refund: '#E11D48', solidDue: false,
};

export const PERIWINKLE_THEME: ModalTheme = {
  accent: '#6B7CF6', accentInk: '#3F4BB8', paid: '#6B7CF6', due: '#4A57C7', refund: '#D97706', solidDue: true,
};

export const ModalThemeContext = createContext<ModalTheme | null>(null);

/** Falls back to the given default when no provider is above (keeps every existing call site unchanged). */
export function useModalTheme(fallback: ModalTheme): ModalTheme {
  return useContext(ModalThemeContext) ?? fallback;
}
