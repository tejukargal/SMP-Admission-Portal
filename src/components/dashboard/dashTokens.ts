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

// ── Switchable accent (periwinkle ⇄ Student Messages cyan in search mode) ─────
// The Dashboard root sets the --dk-* custom properties (registered + transitioned in
// index.css, defaulting to periwinkle), so anything styled through V / mix / the
// var-based classes below crossfades when search mode flips.
export const DASH_ACCENTS = {
  peri: {
    acc: PERI, ink: PERI_INK, border: PERI_BORDER, band: PERI_BAND, bandBorder: PERI_BAND_BORDER,
    tint: PERI_TINT, tile: PERI_TILE, divider: PERI_DIVIDER, bgFrom: '#F7F8FF', bgTo: '#F2F4FE',
  },
  search: {
    acc: '#0891B2', ink: '#0E6A85', border: '#CBE8F0', band: '#ECF7FA', bandBorder: '#B6DEEA',
    tint: '#F7FCFD', tile: '#F2FAFC', divider: '#E4F2F7', bgFrom: '#F2FAFC', bgTo: '#E8F4F8',
  },
} as const;
export type DashAccentMode = keyof typeof DASH_ACCENTS;

export const accentVars = (mode: DashAccentMode) => {
  const a = DASH_ACCENTS[mode];
  return {
    '--dk-acc': a.acc, '--dk-ink': a.ink, '--dk-border': a.border, '--dk-band': a.band,
    '--dk-band-border': a.bandBorder, '--dk-tint': a.tint, '--dk-tile': a.tile,
    '--dk-divider': a.divider, '--dk-bg-from': a.bgFrom, '--dk-bg-to': a.bgTo,
  } as Record<string, string>;
};

/** Live accent colours — use instead of the PERI_* constants on anything that should follow search mode. */
export const V = {
  acc: 'var(--dk-acc)', ink: 'var(--dk-ink)', border: 'var(--dk-border)', band: 'var(--dk-band)',
  bandBorder: 'var(--dk-band-border)', tint: 'var(--dk-tint)', tile: 'var(--dk-tile)', divider: 'var(--dk-divider)',
} as const;

/** `c` at `pct`% over transparent — the var-safe replacement for `${hex}1F`-style alpha suffixes. */
export const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** pastel() for a var() accent: 8% fill, 45% hairline, given ink. */
export const pastelVar = (c: string = V.acc, ink: string = V.ink) => ({
  background: mix(c, 8),
  borderColor: mix(c, 45),
  color: ink,
});

/** Resting card: white, hairline border, hover-only shadow (no resting shadow). */
export const CARD =
  'rounded-2xl border border-(--dk-border) bg-white transition-shadow hover:shadow-[0_4px_16px_rgba(63,75,184,0.07)]';

/** Outline pill button (toolbar). */
export const OUTLINE_PILL_BTN =
  'rounded-full border border-(--dk-border) bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] transition-colors hover:border-(--dk-acc)/40 hover:bg-(--dk-acc)/[0.06] hover:text-(--dk-ink) focus:outline-none focus:ring-2 focus:ring-(--dk-acc)/30';

/** Round icon-only variant. */
export const ICON_PILL_BTN =
  'w-[30px] h-[30px] rounded-full border border-(--dk-border) bg-white inline-flex items-center justify-center text-(--dk-ink) transition-colors hover:border-(--dk-acc)/40 hover:bg-(--dk-acc)/[0.06] focus:outline-none focus:ring-2 focus:ring-(--dk-acc)/30';

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
