/* Shared class strings for the staff and student sign-in pages (petal-aura look). */

export const INK = '#3730A3';

export const FIELD =
  'w-full rounded-xl border border-[#DCDDFB] bg-white px-3.5 py-2.5 text-[14px] text-[#1F2333] placeholder:text-[#A3A8BD] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1] transition-[box-shadow,border-color,background-color] duration-300';

/** Soft rose tint on the fields after a failed sign-in; cleared as soon as the user types. */
export const FIELD_INVALID = '!border-[#F5A3B7] !bg-[#FFF9FA] focus:!ring-[#F43F5E]/20 focus:!border-[#F43F5E]';

export const LABEL = 'block text-[11px] font-medium uppercase tracking-[0.7px] text-[#5B6180] mb-1.5';

/** The floating white card. Pair with `CARD_STYLE`. */
export const CARD =
  'rounded-[28px] border border-white bg-white/95 px-7 py-8 shadow-[0_24px_60px_-24px_rgba(67,56,202,0.35)]';
export const CARD_STYLE = { backdropFilter: 'blur(14px)', animation: 'modal-enter 0.35s ease-out' } as const;

/** Gradient primary button. Pair with `SUBMIT_STYLE`. */
export const SUBMIT =
  'w-full inline-flex items-center justify-center gap-2.5 rounded-xl px-5 py-2.5 text-[15px] font-semibold text-white ' +
  'shadow-[0_8px_22px_rgba(99,102,241,0.32)] transition-[transform,box-shadow,filter] hover:brightness-110 ' +
  'hover:shadow-[0_10px_26px_rgba(168,85,247,0.38)] active:scale-[0.99] disabled:opacity-80 disabled:cursor-wait cursor-pointer ' +
  'focus:outline-none focus:ring-2 focus:ring-[#A855F7]/40 focus:ring-offset-2';
export const SUBMIT_STYLE = { background: 'linear-gradient(90deg, #4F46E5 0%, #8B5CF6 55%, #C026D3 100%)' } as const;

/** Outline secondary link/button (e.g. switching between staff and student sign-in). */
export const SECONDARY =
  'mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#DCDDFB] px-5 py-2 text-[14px] font-medium text-[#4F46E5] hover:bg-[#F4F3FF] transition-colors';
