// Dashboard revamp — soft periwinkle (student-portal look, Outfit via .font-wp).
// Presentation-only tokens shared by Dashboard.tsx and the dashboard cards.
// Every accent `c` follows the pastel rule used on the other revamped pages:
// fill `${c}14` (8% alpha), border `${c}73` (45% alpha), ink = c mixed 72% with black.

export const PERI = '#6B7CF6';
export const PERI_INK = '#3F4BB8';
export const PERI_BORDER = '#DADFFA';
export const PERI_BAND = '#ECEFFD';
export const PERI_BAND_BORDER = '#CDD4F7';
export const PERI_TILE = '#F0F2FE';
export const PERI_TINT = '#F5F6FF';
export const PERI_DIVIDER = '#EBEEFB';

export const INK = '#262B35';
export const MUTED = '#5B6371';
export const FAINT = '#8A93A3';

// Payment status on the Dashboard: indigo intensity (paid = soft periwinkle, due = deeper indigo), amber for partial.
export const PAID = '#6B7CF6';
export const DUE = '#4A57C7';

export const MINT = '#0FA968';
export const CORAL = '#E11D48';
export const AMBER = '#D97706';

export const PAGE_BG = 'linear-gradient(160deg,#F7F8FF 0%,#FCFCFF 45%,#F2F4FE 100%)';

export const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

/** Pastel pill / tile style for an accent colour (fill + hairline + ink). */
export const pastel = (c: string) => ({
  background: `${c}14`,
  borderColor: `${c}73`,
  color: inkOf(c),
});

/** Resting card: white, hairline border, hover-only shadow (no resting shadow). */
export const CARD =
  'rounded-2xl border border-[#DADFFA] bg-white transition-shadow hover:shadow-[0_4px_16px_rgba(63,75,184,0.07)]';

/** Outline pill button (toolbar). */
export const OUTLINE_PILL_BTN =
  'rounded-full border border-[#DADFFA] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] transition-colors hover:border-[#6B7CF6]/40 hover:bg-[#6B7CF6]/[0.06] hover:text-[#3F4BB8] focus:outline-none focus:ring-2 focus:ring-[#6B7CF6]/30';

/** Round icon-only variant. */
export const ICON_PILL_BTN =
  'w-[30px] h-[30px] rounded-full border border-[#DADFFA] bg-white inline-flex items-center justify-center text-[#3F4BB8] transition-colors hover:border-[#6B7CF6]/40 hover:bg-[#6B7CF6]/[0.06] focus:outline-none focus:ring-2 focus:ring-[#6B7CF6]/30';

/** Section eyebrow (replaces the coloured accent-bar labels). */
export const EYEBROW =
  'text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none';

/** Clickable bento tile: hairline border, lift on hover (no resting shadow). */
export const TILE =
  'rounded-2xl border relative overflow-hidden cursor-pointer transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(63,75,184,0.08)]';

/** Very light tint of an accent over white, with a matching hairline. */
export const tileStyle = (c: string) => ({
  background: `linear-gradient(${c}12,${c}12),#fff`,
  borderColor: `${c}40`,
});

/** Soft inner stat well used inside tiles. */
export const wellStyle = (c: string) => ({
  background: '#ffffffB3',
  borderColor: `${c}30`,
});

// Data colours (fed through pastel()/tileStyle() so every hue stays soft).
export const COURSE_HEX = { CE: '#F59E0B', ME: '#10B981', EC: '#0EA5E9', CS: '#14B8A6', EE: '#8B5CF6' } as const;
export const YEAR_HEX = { '1ST YEAR': '#E17FA0', '2ND YEAR': '#9B7FD6', '3RD YEAR': '#F59E0B' } as const;
export const ADM_HEX = { SNQ: '#6B7CF6', LATERAL: '#A66BB8', REPEATER: '#7B7F8C' } as const;
export const BOY_HEX = '#0EA5E9';
export const GIRL_HEX = '#EC4899';

/** Student groups shown per page in Dashboard search results ("Show more" adds this many). */
export const SEARCH_PAGE_SIZE = 10;
