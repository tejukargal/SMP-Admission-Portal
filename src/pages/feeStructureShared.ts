import type { AdmCat, AdmType, Course, FeeStructure, SMPFeeHead, SMPHeads, Year } from '../types';
import { SMP_FEE_HEADS } from '../types';

// Shared by the Settings › Fee Structure sections (structures, late fee, tools).

export type FeeStructureSection = 'structures' | 'late-fee' | 'tools';

export const FEE_STRUCTURE_SECTIONS: FeeStructureSection[] = ['structures', 'late-fee', 'tools'];

export function isFeeStructureSection(value: unknown): value is FeeStructureSection {
  return typeof value === 'string' && (FEE_STRUCTURE_SECTIONS as string[]).includes(value);
}

export const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
export const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
export const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL'];
export const ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];

/** Default SMP amounts applied when creating a new structure */
export const DEFAULT_SMP: SMPHeads = {
  adm:     30,
  tuition: 0,
  lib:     0,
  rr:      100,
  sports:  70,
  lab:     300,
  dvp:     500,
  mag:     60,
  idCard:  10,
  ass:     60,
  swf:     25,
  twf:     25,
  nss:     40,
  fine:    0,
};

/** Human-readable names for the abbreviated SMP head labels. */
export const SMP_HEAD_FULL: Record<SMPFeeHead, string> = {
  adm:     'Admission',
  tuition: 'Tuition',
  lib:     'Library',
  rr:      'Reading Room',
  sports:  'Sports',
  lab:     'Lab',
  dvp:     'Development (DVP)',
  mag:     'Magazine',
  idCard:  'ID Card',
  ass:     'Association',
  swf:     'Student Welfare',
  twf:     'Teacher Welfare',
  nss:     'NSS',
  fine:    'Fine',
};

/** SMP heads edited in the main grid — the 'fine' head is shown on its own row. */
export const SMP_HEADS_NO_FINE = SMP_FEE_HEADS.filter(({ key }) => key !== 'fine');

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export function structureTotals(s: Pick<FeeStructure, 'smp' | 'svk' | 'additionalHeads'>) {
  const smp = sum(SMP_FEE_HEADS.map(({ key }) => s.smp[key]));
  const additional = sum(s.additionalHeads.map((h) => h.amount));
  return { smp, svk: s.svk, additional, grand: smp + s.svk + additional };
}

export function structureDocId(
  academicYear: string, course: Course, year: Year, admType: AdmType, admCat: AdmCat,
): string {
  return `${academicYear}__${course}__${year}__${admType}__${admCat}`;
}

export const selectCls =
  'rounded-md border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

export const amountInputCls =
  'w-full rounded-md border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

export function chipCls(active: boolean): string {
  return `px-2.5 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
    active
      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
      : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-700'
  }`;
}

export const DISCARD_PROMPT = 'You have unsaved changes. Discard them?';
