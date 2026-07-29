import type { Student, Course, Gender, AcademicYear } from '../types';

export interface ManualCertFormData {
  studentName: string;
  fatherName: string;
  regNumber: string;
  course: Course;
  year: '2ND YEAR' | '3RD YEAR';
  academicYear: AcademicYear;
  gender: Gender;
}

/**
 * Builds a fully-typed Student object out of manually entered details so the
 * existing certificate builders (buildStudyCertHTML, generateProvisionalCertificate, etc.)
 * can be reused unmodified for students with no Firestore record. admType is always
 * 'LATERAL' — Working Professional / Evening College students enroll directly into
 * 2nd Year, same as lateral-entry admissions, which drives the existing "admitted
 * through Lateral Entry directly to 2nd Year" wording in those builders.
 */
export function buildSyntheticStudent(form: ManualCertFormData): Student {
  const now = new Date().toISOString();
  return {
    id: `manual-${Date.now()}`,
    studentNameSSLC: form.studentName.trim(),
    studentNameAadhar: form.studentName.trim(),
    fatherName: form.fatherName.trim(),
    motherName: '',
    dateOfBirth: '',
    gender: form.gender,
    religion: 'HINDU',
    caste: '',
    category: 'GM',
    tenthBoard: 'SSLC',
    priorQualification: 'NONE',
    sslcMaxTotal: 0,
    sslcObtainedTotal: 0,
    scienceMax: 0,
    scienceObtained: 0,
    mathsMax: 0,
    mathsObtained: 0,
    mathsScienceMaxTotal: 0,
    mathsScienceObtainedTotal: 0,
    annualIncome: 0,
    address: '',
    town: '',
    taluk: '',
    district: '',
    pucMaxTotal: 0,
    pucObtainedTotal: 0,
    pucPercentage: 0,
    itiMaxTotal: 0,
    itiObtainedTotal: 0,
    itiPercentage: 0,
    itiPucCombination: '',
    fatherMobile: '',
    studentMobile: '',
    course: form.course,
    year: form.year,
    admType: 'LATERAL',
    admCat: 'GM',
    academicYear: form.academicYear,
    admissionStatus: 'ADMITTED',
    enrollmentDate: '',
    applicationNumber: '',
    meritNumber: '',
    regNumber: form.regNumber.trim(),
    aadharNumber: '',
    apaarId: '',
    createdAt: now,
    updatedAt: now,
  };
}
