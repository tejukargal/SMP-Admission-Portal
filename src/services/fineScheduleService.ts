import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AcademicYear, FinePeriod, Year } from '../types';

const COL = 'fineSchedules';

/**
 * Reads the fine schedule for a specific study year, falling back to the legacy
 * academic-year-only schedule (doc id = academicYear) when no per-study-year
 * schedule has been saved yet. This lets existing schedules keep working
 * untouched until an admin explicitly configures a study year separately.
 */
export async function getFineSchedule(
  academicYear: AcademicYear,
  year: Year
): Promise<FinePeriod[]> {
  const perYearSnap = await getDoc(doc(db, COL, `${academicYear}__${year}`));
  if (perYearSnap.exists()) {
    const data = perYearSnap.data() as { periods?: FinePeriod[] };
    return data.periods ?? [];
  }

  const legacySnap = await getDoc(doc(db, COL, academicYear));
  if (!legacySnap.exists()) return [];
  const legacyData = legacySnap.data() as { periods?: FinePeriod[] };
  return legacyData.periods ?? [];
}

/** Always saves to the per-study-year doc; the legacy shared doc (if any) is left untouched. */
export async function saveFineSchedule(
  academicYear: AcademicYear,
  year: Year,
  periods: FinePeriod[]
): Promise<void> {
  await setDoc(doc(db, COL, `${academicYear}__${year}`), {
    academicYear,
    year,
    periods,
    updatedAt: new Date().toISOString(),
  });
}
