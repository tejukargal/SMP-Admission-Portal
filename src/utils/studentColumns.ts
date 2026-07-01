import type { Student } from '../types';

export type ColumnGroup = 'Personal' | 'Academic' | 'Admission' | 'Contact';

export interface ColumnDef {
  key: keyof Student;
  label: string;
  group: ColumnGroup;
  align: 'left' | 'center' | 'right';
}

export const STUDENT_COLUMNS: ColumnDef[] = [
  // ── Personal ──────────────────────────────────────────────────────────────
  { key: 'studentNameSSLC',   label: 'Name (SSLC)',    group: 'Personal', align: 'left'   },
  { key: 'studentNameAadhar', label: 'Name (Aadhar)',  group: 'Personal', align: 'left'   },
  { key: 'fatherName',        label: 'Father Name',    group: 'Personal', align: 'left'   },
  { key: 'motherName',        label: 'Mother Name',    group: 'Personal', align: 'left'   },
  { key: 'dateOfBirth',       label: 'Date of Birth',  group: 'Personal', align: 'center' },
  { key: 'gender',            label: 'Gender',         group: 'Personal', align: 'center' },
  { key: 'religion',          label: 'Religion',       group: 'Personal', align: 'left'   },
  { key: 'caste',             label: 'Caste',          group: 'Personal', align: 'left'   },
  { key: 'category',          label: 'Category',       group: 'Personal', align: 'center' },
  { key: 'address',           label: 'Address',        group: 'Personal', align: 'left'   },
  { key: 'town',              label: 'Town',           group: 'Personal', align: 'left'   },
  { key: 'taluk',             label: 'Taluk',          group: 'Personal', align: 'left'   },
  { key: 'district',          label: 'District',       group: 'Personal', align: 'left'   },
  { key: 'annualIncome',      label: 'Annual Income',  group: 'Personal', align: 'right'  },

  // ── Academic ──────────────────────────────────────────────────────────────
  { key: 'tenthBoard',                label: 'Tenth Board',           group: 'Academic', align: 'left'  },
  { key: 'priorQualification',        label: 'Prior Qualification',  group: 'Academic', align: 'left'  },
  { key: 'sslcMaxTotal',              label: 'SSLC Max',              group: 'Academic', align: 'right' },
  { key: 'sslcObtainedTotal',         label: 'SSLC Obtained',         group: 'Academic', align: 'right' },
  { key: 'scienceMax',                label: 'Science Max',           group: 'Academic', align: 'right' },
  { key: 'scienceObtained',           label: 'Science Obtained',      group: 'Academic', align: 'right' },
  { key: 'mathsMax',                  label: 'Maths Max',             group: 'Academic', align: 'right' },
  { key: 'mathsObtained',             label: 'Maths Obtained',        group: 'Academic', align: 'right' },
  { key: 'mathsScienceMaxTotal',      label: 'M+S Max',               group: 'Academic', align: 'right' },
  { key: 'mathsScienceObtainedTotal', label: 'M+S Obtained',          group: 'Academic', align: 'right' },
  { key: 'pucMaxTotal',               label: 'PUC Max',                group: 'Academic', align: 'right' },
  { key: 'pucObtainedTotal',          label: 'PUC Obtained',           group: 'Academic', align: 'right' },
  { key: 'pucPercentage',             label: 'PUC %',                  group: 'Academic', align: 'right' },
  { key: 'itiMaxTotal',               label: 'ITI Max',                group: 'Academic', align: 'right' },
  { key: 'itiObtainedTotal',          label: 'ITI Obtained',           group: 'Academic', align: 'right' },
  { key: 'itiPercentage',             label: 'ITI %',                  group: 'Academic', align: 'right' },
  { key: 'itiPucCombination',         label: 'ITI/PUC Combination',    group: 'Academic', align: 'left'  },

  // ── Admission ─────────────────────────────────────────────────────────────
  { key: 'course',            label: 'Course',            group: 'Admission', align: 'center' },
  { key: 'year',               label: 'Year',              group: 'Admission', align: 'center' },
  { key: 'admType',            label: 'Adm Type',          group: 'Admission', align: 'center' },
  { key: 'admCat',             label: 'Adm Cat',           group: 'Admission', align: 'center' },
  { key: 'allottedCategory',   label: 'Allotted Category', group: 'Admission', align: 'center' },
  { key: 'academicYear',       label: 'Academic Year',     group: 'Admission', align: 'center' },
  { key: 'admissionStatus',    label: 'Admission Status',  group: 'Admission', align: 'center' },
  { key: 'enrollmentDate',     label: 'Enrollment Date',   group: 'Admission', align: 'center' },
  { key: 'applicationNumber',  label: 'Application No',    group: 'Admission', align: 'left'   },
  { key: 'meritNumber',        label: 'Merit No',          group: 'Admission', align: 'left'   },
  { key: 'regNumber',          label: 'Reg No',            group: 'Admission', align: 'left'   },
  { key: 'aadharNumber',       label: 'Aadhar No',         group: 'Admission', align: 'left'   },
  { key: 'apaarId',            label: 'APAAR ID',          group: 'Admission', align: 'left'   },

  // ── Contact ───────────────────────────────────────────────────────────────
  { key: 'fatherMobile',  label: 'Father Mobile',  group: 'Contact', align: 'left' },
  { key: 'studentMobile', label: 'Student Mobile', group: 'Contact', align: 'left' },
];

export const COLUMN_GROUPS: ColumnGroup[] = ['Personal', 'Academic', 'Admission', 'Contact'];

export const DEFAULT_CUSTOM_COLUMNS: (keyof Student)[] = [
  'studentNameSSLC', 'course', 'year', 'category', 'gender',
  'studentMobile', 'sslcObtainedTotal', 'admissionStatus',
];

export function formatColumnValue(col: ColumnDef, s: Student): string {
  const v = s[col.key];
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}
