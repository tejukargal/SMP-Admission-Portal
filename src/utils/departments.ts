// Department design tokens for the Circulars feature — ported from the SMP
// Connect notice-board app. Every class string below is a complete literal
// (never template-built) because Tailwind 4 discovers classes by scanning
// source text.
import type { Department } from '../types';

export interface DepartmentMeta {
  code: Department;
  name: string;
  /** Filter chip when this department is the active filter. */
  chipActive: string;
  /** Small rounded badge on cards/modals: tinted bg + colored text + border. */
  pill: string;
  /** Card background tint. */
  cardBg: string;
  /** Card left-accent border color (used with border-l-4). */
  borderL: string;
  /** Softer/lighter variant of borderL for pastel card accents. */
  borderLSoft: string;
  /** Department-colored text (subject line, icons). */
  text: string;
}

export const DEPARTMENTS: Record<Department, DepartmentMeta> = {
  'CE': {
    code: 'CE', name: 'Civil Engineering',
    chipActive: 'bg-blue-600 text-white border-blue-600',
    pill: 'bg-blue-50 text-blue-700 border-blue-300',
    cardBg: 'bg-blue-50/60', borderL: 'border-l-blue-500', borderLSoft: 'border-l-blue-300', text: 'text-blue-700',
  },
  'ME': {
    code: 'ME', name: 'Mechanical Engineering',
    chipActive: 'bg-emerald-600 text-white border-emerald-600',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    cardBg: 'bg-emerald-50/60', borderL: 'border-l-emerald-500', borderLSoft: 'border-l-emerald-300', text: 'text-emerald-700',
  },
  'CS': {
    code: 'CS', name: 'Computer Science',
    chipActive: 'bg-violet-600 text-white border-violet-600',
    pill: 'bg-violet-50 text-violet-700 border-violet-300',
    cardBg: 'bg-violet-50/60', borderL: 'border-l-violet-500', borderLSoft: 'border-l-violet-300', text: 'text-violet-700',
  },
  'EC': {
    code: 'EC', name: 'Electronics & Communication',
    chipActive: 'bg-orange-600 text-white border-orange-600',
    pill: 'bg-orange-50 text-orange-700 border-orange-300',
    cardBg: 'bg-orange-50/60', borderL: 'border-l-orange-500', borderLSoft: 'border-l-orange-300', text: 'text-orange-700',
  },
  'EE': {
    code: 'EE', name: 'Electrical & Electronics',
    chipActive: 'bg-red-600 text-white border-red-600',
    pill: 'bg-red-50 text-red-700 border-red-300',
    cardBg: 'bg-red-50/60', borderL: 'border-l-red-500', borderLSoft: 'border-l-red-300', text: 'text-red-700',
  },
  'All': {
    code: 'All', name: 'All Departments',
    chipActive: 'bg-gray-700 text-white border-gray-700',
    pill: 'bg-gray-100 text-gray-700 border-gray-300',
    cardBg: 'bg-gray-50/80', borderL: 'border-l-gray-500', borderLSoft: 'border-l-gray-300', text: 'text-gray-700',
  },
  'Office': {
    code: 'Office', name: 'Office',
    chipActive: 'bg-cyan-600 text-white border-cyan-600',
    pill: 'bg-cyan-50 text-cyan-700 border-cyan-300',
    cardBg: 'bg-cyan-50/60', borderL: 'border-l-cyan-500', borderLSoft: 'border-l-cyan-300', text: 'text-cyan-700',
  },
  'Results': {
    code: 'Results', name: 'Results',
    chipActive: 'bg-lime-600 text-white border-lime-600',
    pill: 'bg-lime-50 text-lime-700 border-lime-300',
    cardBg: 'bg-lime-50/60', borderL: 'border-l-lime-500', borderLSoft: 'border-l-lime-300', text: 'text-lime-700',
  },
  'Fee Dues': {
    code: 'Fee Dues', name: 'Fee Dues',
    chipActive: 'bg-amber-600 text-white border-amber-600',
    pill: 'bg-amber-50 text-amber-700 border-amber-300',
    cardBg: 'bg-amber-50/60', borderL: 'border-l-amber-500', borderLSoft: 'border-l-amber-300', text: 'text-amber-700',
  },
  'Exams': {
    code: 'Exams', name: 'Exams',
    chipActive: 'bg-rose-600 text-white border-rose-600',
    pill: 'bg-rose-50 text-rose-700 border-rose-300',
    cardBg: 'bg-rose-50/60', borderL: 'border-l-rose-500', borderLSoft: 'border-l-rose-300', text: 'text-rose-700',
  },
  'Scholarships': {
    code: 'Scholarships', name: 'Scholarships',
    chipActive: 'bg-green-600 text-white border-green-600',
    pill: 'bg-green-50 text-green-700 border-green-300',
    cardBg: 'bg-green-50/60', borderL: 'border-l-green-500', borderLSoft: 'border-l-green-300', text: 'text-green-700',
  },
  'Internship': {
    code: 'Internship', name: 'Internship',
    chipActive: 'bg-purple-600 text-white border-purple-600',
    pill: 'bg-purple-50 text-purple-700 border-purple-300',
    cardBg: 'bg-purple-50/60', borderL: 'border-l-purple-500', borderLSoft: 'border-l-purple-300', text: 'text-purple-700',
  },
  'Annual Day': {
    code: 'Annual Day', name: 'Annual Day',
    chipActive: 'bg-pink-600 text-white border-pink-600',
    pill: 'bg-pink-50 text-pink-700 border-pink-300',
    cardBg: 'bg-pink-50/60', borderL: 'border-l-pink-500', borderLSoft: 'border-l-pink-300', text: 'text-pink-700',
  },
  'Functions': {
    code: 'Functions', name: 'Functions',
    chipActive: 'bg-fuchsia-600 text-white border-fuchsia-600',
    pill: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-300',
    cardBg: 'bg-fuchsia-50/60', borderL: 'border-l-fuchsia-500', borderLSoft: 'border-l-fuchsia-300', text: 'text-fuchsia-700',
  },
  'Admission Ticket': {
    code: 'Admission Ticket', name: 'Admission Ticket',
    chipActive: 'bg-teal-600 text-white border-teal-600',
    pill: 'bg-teal-50 text-teal-700 border-teal-300',
    cardBg: 'bg-teal-50/60', borderL: 'border-l-teal-500', borderLSoft: 'border-l-teal-300', text: 'text-teal-700',
  },
  'Admissions': {
    code: 'Admissions', name: 'Admissions',
    chipActive: 'bg-sky-600 text-white border-sky-600',
    pill: 'bg-sky-50 text-sky-700 border-sky-300',
    cardBg: 'bg-sky-50/60', borderL: 'border-l-sky-500', borderLSoft: 'border-l-sky-300', text: 'text-sky-700',
  },
  'Red Cross': {
    code: 'Red Cross', name: 'Red Cross',
    chipActive: 'bg-red-700 text-white border-red-700',
    pill: 'bg-red-100 text-red-800 border-red-400',
    cardBg: 'bg-red-100/50', borderL: 'border-l-red-700', borderLSoft: 'border-l-red-400', text: 'text-red-800',
  },
  'NSS': {
    code: 'NSS', name: 'NSS',
    chipActive: 'bg-cyan-700 text-white border-cyan-700',
    pill: 'bg-cyan-100 text-cyan-800 border-cyan-400',
    cardBg: 'bg-cyan-100/50', borderL: 'border-l-cyan-700', borderLSoft: 'border-l-cyan-400', text: 'text-cyan-800',
  },
};

export const DEPARTMENT_ORDER: Department[] = [
  'All', 'CE', 'ME', 'CS', 'EC', 'EE', 'Office', 'Results', 'Fee Dues', 'Exams',
  'Scholarships', 'Internship', 'Annual Day', 'Functions', 'Admission Ticket',
  'Admissions', 'Red Cross', 'NSS',
];

/** Safe lookup — unknown values (future/renamed departments in old docs) fall back to 'All' styling. */
export function departmentMeta(dept: string): DepartmentMeta {
  return DEPARTMENTS[dept as Department] ?? DEPARTMENTS['All'];
}
