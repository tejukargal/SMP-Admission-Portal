import {
  collection, getDocs, addDoc, deleteDoc,
  doc, query, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Student, AcademicYear, MeritListSnapshot, MeritListStudent } from '../types';

const COLL = 'meritListSnapshots';

function toMeritStudent(s: Student): MeritListStudent {
  return {
    studentNameSSLC:          s.studentNameSSLC,
    fatherName:               s.fatherName,
    gender:                   s.gender,
    dateOfBirth:              s.dateOfBirth,
    category:                 s.category,
    annualIncome:             s.annualIncome,
    mathsScienceMaxTotal:     s.mathsScienceMaxTotal,
    mathsScienceObtainedTotal:s.mathsScienceObtainedTotal,
    sslcMaxTotal:             s.sslcMaxTotal,
    sslcObtainedTotal:        s.sslcObtainedTotal,
    meritNumber:              s.meritNumber,
    course:                   s.course,
    year:                     s.year,
  };
}

function toLateralMeritStudent(s: Student): MeritListStudent {
  return {
    ...toMeritStudent(s),
    priorQualification:  s.priorQualification,
    itiMaxTotal:         s.itiMaxTotal,
    itiObtainedTotal:    s.itiObtainedTotal,
    itiPercentage:       s.itiPercentage,
    pucMaxTotal:         s.pucMaxTotal,
    pucObtainedTotal:    s.pucObtainedTotal,
    pucPercentage:       s.pucPercentage,
    itiPucCombination:   s.itiPucCombination || '',
  };
}

export async function getMeritListSnapshots(academicYear: AcademicYear): Promise<MeritListSnapshot[]> {
  const q = query(
    collection(db, COLL),
    where('academicYear', '==', academicYear),
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MeritListSnapshot));
  return docs.sort((a, b) => a.phase - b.phase);
}

export async function saveMeritListSnapshot(
  academicYear: AcademicYear,
  students: Student[],
  existingCount: number,
): Promise<MeritListSnapshot> {
  const phase = existingCount + 1;
  const payload = {
    phase,
    academicYear,
    savedAt: new Date().toISOString(),
    students: students.map(toMeritStudent),
  };
  const ref = await addDoc(collection(db, COLL), payload);
  return { id: ref.id, ...payload };
}

export async function saveLateralMeritListSnapshot(
  academicYear: AcademicYear,
  students: Student[],
  existingCount: number,
): Promise<MeritListSnapshot> {
  const phase = existingCount + 1;
  const payload = {
    phase,
    academicYear,
    type: 'lateral' as const,
    savedAt: new Date().toISOString(),
    students: students.map(toLateralMeritStudent),
  };
  const ref = await addDoc(collection(db, COLL), payload);
  return { id: ref.id, ...payload };
}

export async function deleteMeritListSnapshot(id: string): Promise<void> {
  await deleteDoc(doc(db, COLL, id));
}
