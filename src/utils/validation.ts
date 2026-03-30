import type { StudentFormData } from '../types';

export interface ValidationErrors {
  [key: string]: string;
}

const MOBILE_RE = /^[6-9]\d{9}$/;

// Fields that block save in edit mode
const EDIT_MANDATORY: (keyof StudentFormData)[] = [
  'studentNameSSLC',
  'studentNameAadhar',
  'course',
  'year',
];

// Fields shown in red (warned) but don't block save in edit mode
const EDIT_WARN_EMPTY: (keyof StudentFormData)[] = [
  'fatherName',
  'motherName',
  'dateOfBirth',
  'gender',
  'religion',
  'caste',
  'category',
  'address',
  'admType',
  'admCat',
  'academicYear',
  'admissionStatus',
  'regNumber',
];

export interface EditValidationResult {
  errors: ValidationErrors;
  warnings: ValidationErrors;
}

export function validateStudentFormEdit(data: StudentFormData): EditValidationResult {
  const errors: ValidationErrors = {};
  const warnings: ValidationErrors = {};

  for (const field of EDIT_MANDATORY) {
    if (!data[field] || String(data[field]).trim() === '') {
      errors[field as string] = 'This field is required';
    }
  }

  for (const field of EDIT_WARN_EMPTY) {
    if (!data[field] || String(data[field]).trim() === '') {
      warnings[field as string] = 'This field is empty';
    }
  }

  // Date format (only if non-empty — empty already caught above)
  if (data.dateOfBirth && !/^\d{2}\/\d{2}\/\d{4}$/.test(data.dateOfBirth)) {
    warnings['dateOfBirth'] = 'Enter date in DD/MM/YYYY format';
  } else if (data.dateOfBirth && /^\d{2}\/\d{2}\/\d{4}$/.test(data.dateOfBirth)) {
    const [dd, mm, yyyy] = data.dateOfBirth.split('/').map(Number);
    const date = new Date(yyyy, mm - 1, dd);
    if (date.getDate() !== dd || date.getMonth() !== mm - 1 || date.getFullYear() !== yyyy) {
      warnings['dateOfBirth'] = 'Invalid date';
    }
  }

  // Mobile format warnings
  for (const field of (['fatherMobile', 'studentMobile'] as (keyof StudentFormData)[])) {
    const val = String(data[field] ?? '');
    if (val && !MOBILE_RE.test(val)) {
      warnings[field as string] = 'Enter a valid 10-digit mobile number starting with 6-9';
    }
  }

  // Marks warnings
  const markFields: (keyof StudentFormData)[] = [
    'sslcMaxTotal', 'sslcObtainedTotal', 'scienceMax', 'scienceObtained', 'mathsMax', 'mathsObtained',
  ];
  for (const field of markFields) {
    if (isNaN(Number(data[field])) || Number(data[field]) < 0) {
      warnings[field as string] = 'Value must be 0 or greater';
    }
  }
  if (Number(data.sslcObtainedTotal) > Number(data.sslcMaxTotal))
    warnings['sslcObtainedTotal'] = 'Obtained cannot exceed maximum';
  if (Number(data.scienceObtained) > Number(data.scienceMax))
    warnings['scienceObtained'] = 'Obtained cannot exceed maximum';
  if (Number(data.mathsObtained) > Number(data.mathsMax))
    warnings['mathsObtained'] = 'Obtained cannot exceed maximum';

  // Address sub-fields — warn when address is filled but sub-fields are empty
  if (String(data.address ?? '').trim()) {
    if (!String(data.town ?? '').trim()) warnings['town'] = 'Required when address is filled';
    if (!String(data.taluk ?? '').trim()) warnings['taluk'] = 'Required when address is filled';
    if (!String(data.district ?? '').trim()) warnings['district'] = 'Required when address is filled';
  }

  // Prior qualification percentage
  if (data.priorQualification === 'PUC') {
    const pct = Number(data.pucPercentage);
    if (!pct || pct <= 0 || pct > 100) warnings['pucPercentage'] = 'Enter a valid PUC percentage (0–100)';
  }
  if (data.priorQualification === 'ITI') {
    const pct = Number(data.itiPercentage);
    if (!pct || pct <= 0 || pct > 100) warnings['itiPercentage'] = 'Enter a valid ITI percentage (0–100)';
  }

  return { errors, warnings };
}

export function validateStudentForm(data: StudentFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  // Mandatory personal identity fields
  const requiredPersonal: (keyof StudentFormData)[] = [
    'studentNameSSLC',
    'studentNameAadhar',
    'gender',
    'religion',
  ];

  // Mandatory enrollment details fields
  const requiredEnrollment: (keyof StudentFormData)[] = [
    'course',
    'year',
    'admType',
    'admCat',
    'academicYear',
    'admissionStatus',
  ];

  for (const field of [...requiredPersonal, ...requiredEnrollment]) {
    const val = data[field];
    if (!val || String(val).trim() === '') {
      errors[field] = 'This field is required';
    }
  }

  // Date of birth DD/MM/YYYY validation (only if provided)
  if (data.dateOfBirth) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data.dateOfBirth)) {
      errors['dateOfBirth'] = 'Enter date in DD/MM/YYYY format';
    } else {
      const [dd, mm, yyyy] = data.dateOfBirth.split('/').map(Number);
      const date = new Date(yyyy, mm - 1, dd);
      if (date.getDate() !== dd || date.getMonth() !== mm - 1 || date.getFullYear() !== yyyy) {
        errors['dateOfBirth'] = 'Invalid date';
      }
    }
  }

  // Mobile validation (only if provided)
  for (const field of (['fatherMobile', 'studentMobile'] as (keyof StudentFormData)[])) {
    const val = String(data[field] ?? '');
    if (val && !MOBILE_RE.test(val)) {
      errors[field] = 'Enter a valid 10-digit mobile number starting with 6-9';
    }
  }

  // Marks non-negative
  const markFields: (keyof StudentFormData)[] = [
    'sslcMaxTotal',
    'sslcObtainedTotal',
    'scienceMax',
    'scienceObtained',
    'mathsMax',
    'mathsObtained',
  ];
  for (const field of markFields) {
    const val = Number(data[field]);
    if (isNaN(val) || val < 0) {
      errors[field] = 'Value must be 0 or greater';
    }
  }

  // Obtained ≤ Max
  if (Number(data.sslcObtainedTotal) > Number(data.sslcMaxTotal)) {
    errors['sslcObtainedTotal'] = 'Obtained cannot exceed maximum';
  }
  if (Number(data.scienceObtained) > Number(data.scienceMax)) {
    errors['scienceObtained'] = 'Obtained cannot exceed maximum';
  }
  if (Number(data.mathsObtained) > Number(data.mathsMax)) {
    errors['mathsObtained'] = 'Obtained cannot exceed maximum';
  }

  // Address sub-fields — required when address is filled
  if (String(data.address ?? '').trim()) {
    if (!String(data.town ?? '').trim()) errors['town'] = 'Required when address is filled';
    if (!String(data.taluk ?? '').trim()) errors['taluk'] = 'Required when address is filled';
    if (!String(data.district ?? '').trim()) errors['district'] = 'Required when address is filled';
  }

  // Prior qualification percentage
  if (data.priorQualification === 'PUC') {
    const pct = Number(data.pucPercentage);
    if (!pct || pct <= 0 || pct > 100) errors['pucPercentage'] = 'Enter a valid PUC percentage (0–100)';
  }
  if (data.priorQualification === 'ITI') {
    const pct = Number(data.itiPercentage);
    if (!pct || pct <= 0 || pct > 100) errors['itiPercentage'] = 'Enter a valid ITI percentage (0–100)';
  }

  return errors;
}
