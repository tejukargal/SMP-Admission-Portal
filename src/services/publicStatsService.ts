import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Student, Course, Year } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type SCell = { regular: number; ltrl: number; snq: number; rptr: number };
type CCell = { gm: number; c1: number; twoA: number; twoB: number; threeA: number; threeB: number; sc: number; st: number };

export interface PublicStatsData {
  academicYear: string;
  total: number;
  boys: number;
  girls: number;
  byCourse: Record<string, number>;
  byYear: Record<string, number>;
  byAdmType: Record<string, number>;
  byCourseByYear: Record<string, Record<string, number>>;
  byYearByCourse: Record<string, Record<string, number>>;
  firstYearSeats: Record<string, { regularConfirmed: number; snqConfirmed: number }>;
  summaryTable: Record<string, Record<string, SCell>>;
  catTable: Record<string, Record<string, CCell>>;
  updatedAt: string;
}

// ── Computation ───────────────────────────────────────────────────────────────

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[]     = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

export function computePublicStats(confirmed: Student[], academicYear: string): PublicStatsData {
  const total = confirmed.length;
  const boys  = confirmed.filter((s) => s.gender === 'BOY').length;
  const girls = confirmed.filter((s) => s.gender === 'GIRL').length;

  const byCourse:  Record<string, number> = Object.fromEntries(COURSES.map((c) => [c, 0]));
  const byYear:    Record<string, number> = Object.fromEntries(YEARS.map((y) => [y, 0]));
  const byAdmType: Record<string, number> = { REGULAR: 0, REPEATER: 0, LATERAL: 0, EXTERNAL: 0, SNQ: 0 };

  const byCourseByYear: Record<string, Record<string, number>> = Object.fromEntries(
    COURSES.map((c) => [c, Object.fromEntries(YEARS.map((y) => [y, 0]))])
  );
  const byYearByCourse: Record<string, Record<string, number>> = Object.fromEntries(
    YEARS.map((y) => [y, Object.fromEntries(COURSES.map((c) => [c, 0]))])
  );
  const firstYearSeats: Record<string, { regularConfirmed: number; snqConfirmed: number }> =
    Object.fromEntries(COURSES.map((c) => [c, { regularConfirmed: 0, snqConfirmed: 0 }]));

  const summaryTable: Record<string, Record<string, SCell>> = Object.fromEntries(
    YEARS.map((y) => [y, Object.fromEntries(COURSES.map((c) => [c, { regular: 0, ltrl: 0, snq: 0, rptr: 0 }]))])
  );
  const catTable: Record<string, Record<string, CCell>> = Object.fromEntries(
    YEARS.map((y) => [y, Object.fromEntries(COURSES.map((c) => [c, { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0 }]))])
  );

  for (const s of confirmed) {
    if (s.course in byCourse) byCourse[s.course]++;
    if (s.year   in byYear)   byYear[s.year]++;
    if (s.admType in byAdmType) byAdmType[s.admType]++;
    if (s.course in byCourseByYear && s.year in byCourseByYear[s.course]) byCourseByYear[s.course][s.year]++;
    if (s.year in byYearByCourse && s.course in byYearByCourse[s.year])   byYearByCourse[s.year][s.course]++;

    if (s.year === '1ST YEAR' && s.course in firstYearSeats) {
      if (s.admType === 'REGULAR' && s.admCat === 'GM') firstYearSeats[s.course].regularConfirmed++;
      else if (s.admCat === 'SNQ')                       firstYearSeats[s.course].snqConfirmed++;
    }

    if (s.year in summaryTable && s.course in summaryTable[s.year]) {
      const sc = summaryTable[s.year][s.course];
      if (s.admCat === 'SNQ')            sc.snq++;
      else if (s.admType === 'LATERAL')  sc.ltrl++;
      else if (s.admType === 'REPEATER') sc.rptr++;
      else                               sc.regular++;
    }

    if (s.year in catTable && s.course in catTable[s.year]) {
      const cc = catTable[s.year][s.course];
      switch (s.category) {
        case 'GM':  cc.gm++;    break;
        case 'C1':  cc.c1++;    break;
        case '2A':  cc.twoA++;  break;
        case '2B':  cc.twoB++;  break;
        case '3A':  cc.threeA++;break;
        case '3B':  cc.threeB++;break;
        case 'SC':  cc.sc++;    break;
        case 'ST':  cc.st++;    break;
      }
    }
  }

  return {
    academicYear, total, boys, girls,
    byCourse, byYear, byAdmType,
    byCourseByYear, byYearByCourse,
    firstYearSeats, summaryTable, catTable,
    updatedAt: new Date().toISOString(),
  };
}

// ── Firestore I/O ─────────────────────────────────────────────────────────────

const META_DOC = doc(db, 'meta', 'publicStats');

export async function savePublicStats(data: PublicStatsData): Promise<void> {
  await setDoc(META_DOC, data);
}

export async function getPublicStats(): Promise<PublicStatsData | null> {
  try {
    const snap = await getDoc(META_DOC);
    return snap.exists() ? (snap.data() as PublicStatsData) : null;
  } catch {
    return null;
  }
}
