import { useState, useEffect, useMemo, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { addStudent, getStudent, updateStudent, getAllStudents, getStudentsByAcademicYear, peekNextDefaultRegNumber } from '../services/studentService';
import { applyAdmCatFeeAdjustment, applyCourseYearUpdate } from '../services/feeRecordService';
import { validateStudentForm, validateStudentFormEdit, type ValidationErrors } from '../utils/validation';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { KARNATAKA_TALUKS, KARNATAKA_TALUK_DISTRICT } from '../data/karnatakaLocations';
import type { Student, StudentFormData, AcademicYear, Course, Year, Gender, Religion, Category, AdmType, AdmCat, TenthBoard, PriorQualification } from '../types';

const GENDER_OPTIONS = [
  { value: 'BOY', label: 'BOY' },
  { value: 'GIRL', label: 'GIRL' },
];

const RELIGION_OPTIONS = [
  { value: 'HINDU', label: 'HINDU' },
  { value: 'MUSLIM', label: 'MUSLIM' },
  { value: 'CHRISTIAN', label: 'CHRISTIAN' },
  { value: 'JAIN', label: 'JAIN' },
  { value: 'BUDDHIST', label: 'BUDDHIST' },
  { value: 'SIKH', label: 'SIKH' },
];

const TENTH_BOARD_OPTIONS = [
  { value: 'SSLC',         label: 'SSLC' },
  { value: 'CBSE',         label: 'CBSE' },
  { value: 'ICSE',         label: 'ICSE' },
  { value: 'OUT OF STATE', label: 'OUT OF STATE' },
];

const PRIOR_QUALIFICATION_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'ITI',  label: 'ITI' },
  { value: 'PUC',  label: 'PUC' },
];

const CATEGORY_OPTIONS = [
  { value: 'GM', label: 'GM' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
  { value: 'C1', label: 'C1' },
  { value: '2A', label: '2A' },
  { value: '2B', label: '2B' },
  { value: '3A', label: '3A' },
  { value: '3B', label: '3B' },
];

const COURSE_OPTIONS = [
  { value: 'CE', label: 'CE - Civil Engineering' },
  { value: 'ME', label: 'ME - Mechanical Engineering' },
  { value: 'EC', label: 'EC - Electronics & Communication' },
  { value: 'CS', label: 'CS - Computer Science' },
  { value: 'EE', label: 'EE - Electrical Engineering' },
];

const YEAR_OPTIONS = [
  { value: '1ST YEAR', label: '1ST YEAR' },
  { value: '2ND YEAR', label: '2ND YEAR' },
  { value: '3RD YEAR', label: '3RD YEAR' },
];

const ADM_TYPE_OPTIONS = [
  { value: 'REGULAR', label: 'REGULAR' },
  { value: 'REPEATER', label: 'REPEATER' },
  { value: 'LATERAL', label: 'LATERAL' },
  { value: 'EXTERNAL', label: 'EXTERNAL' },
];

const ADM_CAT_OPTIONS = [
  { value: 'GM', label: 'GM' },
  { value: 'SNQ', label: 'SNQ' },
  { value: 'OTHERS', label: 'OTHERS' },
];

const ACADEMIC_YEAR_OPTIONS = [
  { value: '2024-25', label: '2024-25' },
  { value: '2025-26', label: '2025-26' },
  { value: '2026-27', label: '2026-27' },
  { value: '2027-28', label: '2027-28' },
  { value: '2028-29', label: '2028-29' },
  { value: '2029-30', label: '2029-30' },
];

const ADMISSION_STATUS_OPTIONS = [
  { value: 'PROVISIONAL', label: 'PROVISIONAL' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
  { value: 'CANCELLED', label: 'CANCELLED' },
  { value: 'PENDING', label: 'PENDING' },
];

interface YearWarningModalProps {
  studentName: string;
  selectedYear: string;
  conflictRecord: Student;
  onProceed: () => void;
  onEdit: () => void;
}

function YearWarningModal({ studentName, selectedYear, conflictRecord, onProceed, onEdit }: YearWarningModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-amber-500">⚠</span> Year Conflict Detected
          </h3>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{studentName}</span> was already enrolled as{' '}
            <span className="font-semibold text-amber-700">{conflictRecord.year}</span> in{' '}
            <span className="font-semibold text-amber-700">{conflictRecord.academicYear}</span>.
          </p>
          <p className="text-sm text-gray-700">
            Saving as <span className="font-semibold">{selectedYear}</span> again may indicate the student
            was <span className="font-semibold text-red-600">not promoted</span>. Do you want to proceed,
            or go back and edit the year?
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
          <Button variant="secondary" onClick={onEdit}>Edit Year</Button>
          <Button onClick={onProceed}>Proceed Anyway</Button>
        </div>
      </div>
    </div>
  );
}

const COURSE_LABEL: Record<string, string> = {
  CE: 'CE - Civil Engineering',
  ME: 'ME - Mechanical Engineering',
  EC: 'EC - Electronics & Communication',
  CS: 'CS - Computer Science',
  EE: 'EE - Electrical Engineering',
};

interface EnrollmentPreviewProps {
  form: StudentFormData;
  saving: boolean;
  errorMsg: string;
  onConfirm: () => void;
  onEdit: () => void;
}

function PreviewRow({ label, value, required }: { label: string; value: string | number; required?: boolean }) {
  const display = value === '' || value === 0 || value === null || value === undefined
    ? null
    : String(value);
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-gray-100 last:border-0">
      <dt className="text-xs text-gray-500 font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </dt>
      <dd className={`text-xs font-semibold ${display ? 'text-gray-900' : 'text-gray-300'}`}>
        {display ?? '—'}
      </dd>
    </div>
  );
}

function EnrollmentPreview({ form, saving, errorMsg, onConfirm, onEdit }: EnrollmentPreviewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Review Enrollment Details</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Please verify all details before confirming. Fields marked <span className="text-red-500 font-bold">*</span> are mandatory.
          </p>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Personal Information */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Personal Information</h3>
            <dl>
              <PreviewRow label="Name (SSLC)" value={form.studentNameSSLC} required />
              <PreviewRow label="Name (Aadhar)" value={form.studentNameAadhar} required />
              <PreviewRow label="Father Name" value={form.fatherName} />
              <PreviewRow label="Mother Name" value={form.motherName} />
              <PreviewRow label="Date of Birth" value={form.dateOfBirth} />
              <PreviewRow label="Gender" value={form.gender} required />
              <PreviewRow label="Religion" value={form.religion} required />
              <PreviewRow label="Caste" value={form.caste} />
              <PreviewRow label="Category" value={form.category} />
              <PreviewRow label="Annual Income" value={form.annualIncome > 0 ? `₹ ${form.annualIncome.toLocaleString()}` : ''} />
            </dl>
          </section>

          {/* Contact */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contact Details</h3>
            <dl>
              <PreviewRow label="Father Mobile" value={form.fatherMobile} />
              <PreviewRow label="Student Mobile" value={form.studentMobile} />
              <PreviewRow label="Address" value={form.address} />
              <PreviewRow label="Town / City" value={form.town} />
              <PreviewRow label="Taluk" value={form.taluk} />
              <PreviewRow label="District" value={form.district} />
            </dl>
          </section>

          {/* SSLC Marks */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">SSLC Marks</h3>
            <dl>
              <PreviewRow label="10th Board" value={form.tenthBoard} />
              <PreviewRow label="Prior Qualification" value={form.priorQualification} />
              {form.priorQualification === 'PUC' && (
                <PreviewRow label="PUC Percentage" value={form.pucPercentage ? `${form.pucPercentage}%` : ''} />
              )}
              {form.priorQualification === 'ITI' && (
                <PreviewRow label="ITI Percentage" value={form.itiPercentage ? `${form.itiPercentage}%` : ''} />
              )}
              <PreviewRow label="SSLC Max Total" value={form.sslcMaxTotal} />
              <PreviewRow label="SSLC Obtained Total" value={form.sslcObtainedTotal} />
              <PreviewRow
                label="SSLC Percentage"
                value={form.sslcMaxTotal > 0 ? `${((form.sslcObtainedTotal / form.sslcMaxTotal) * 100).toFixed(2)}%` : ''}
              />
              <PreviewRow label="Science Max" value={form.scienceMax} />
              <PreviewRow label="Science Obtained" value={form.scienceObtained} />
              <PreviewRow label="Maths Max" value={form.mathsMax} />
              <PreviewRow label="Maths Obtained" value={form.mathsObtained} />
              <PreviewRow label="Maths + Science Max Total" value={form.mathsScienceMaxTotal} />
              <PreviewRow label="Maths + Science Obtained Total" value={form.mathsScienceObtainedTotal} />
            </dl>
          </section>

          {/* Enrollment Details */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Enrollment Details</h3>
            <dl>
              <PreviewRow label="Course" value={COURSE_LABEL[form.course] ?? form.course} required />
              <PreviewRow label="Year" value={form.year} required />
              <PreviewRow label="Adm Type" value={form.admType} required />
              <PreviewRow label="Adm Cat" value={form.admCat} required />
              <PreviewRow label="Academic Year" value={form.academicYear} required />
              <PreviewRow label="Admission Status" value={form.admissionStatus} required />
              <PreviewRow label="Reg Number" value={form.regNumber} />
            </dl>
          </section>
        </div>

        {errorMsg && (
          <div className="mx-6 mb-3 text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
          <Button variant="secondary" size="lg" onClick={onEdit} disabled={saving}>
            Edit Details
          </Button>
          <Button size="lg" loading={saving} onClick={onConfirm}>
            Confirm &amp; Enroll
          </Button>
        </div>
      </div>
    </div>
  );
}

function emptyForm(defaultYear?: AcademicYear): StudentFormData {
  return {
    studentNameSSLC: '',
    studentNameAadhar: '',
    fatherName: '',
    motherName: '',
    dateOfBirth: '',
    gender: '' as Gender,
    religion: '' as Religion,
    caste: '',
    category: 'GM' as Category,
    tenthBoard: 'SSLC' as TenthBoard,
    priorQualification: 'NONE' as PriorQualification,
    sslcMaxTotal: 625,
    sslcObtainedTotal: 0,
    scienceMax: 100,
    scienceObtained: 0,
    mathsMax: 100,
    mathsObtained: 0,
    mathsScienceMaxTotal: 200,
    mathsScienceObtainedTotal: 0,
    annualIncome: 0,
    address: '',
    town: '',
    taluk: '',
    district: '',
    pucPercentage: 0,
    itiPercentage: 0,
    fatherMobile: '',
    studentMobile: '',
    course: '' as Course,
    year: '' as Year,
    admType: 'REGULAR' as AdmType,
    admCat: 'GM' as AdmCat,
    academicYear: defaultYear ?? ('' as AcademicYear),
    admissionStatus: '',
    meritNumber: '',
    regNumber: '',
  };
}

export function EnrollStudent() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const backTo = fromDashboard ? '/dashboard' : '/students';
  const backLabel = fromDashboard ? 'Back to Dashboard' : 'Back to Students';
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [form, setForm] = useState<StudentFormData>(emptyForm());
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [editOriginalYear, setEditOriginalYear] = useState<{ year: string; academicYear: string } | null>(null);
  const [editOriginalAdmCat, setEditOriginalAdmCat] = useState<AdmCat | null>(null);
  const [editOriginalCourse, setEditOriginalCourse] = useState<string | null>(null);
  const [enrollmentHistory, setEnrollmentHistory] = useState<Student[]>([]);
  const [showYearWarning, setShowYearWarning] = useState(false);
  const [yearConflictRecord, setYearConflictRecord] = useState<Student | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Caste autocomplete
  type CasteEntry = { caste: string; category: Category };
  const casteIndexRef = useRef<CasteEntry[] | null>(null);
  const casteSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [casteSuggestions, setCasteSuggestions] = useState<CasteEntry[]>([]);
  const [casteOpen, setCasteOpen] = useState(false);
  const [casteHighlight, setCasteHighlight] = useState(-1);

  // Taluk autocomplete
  const talukSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [talukSuggestions, setTalukSuggestions] = useState<string[]>([]);
  const [talukOpen, setTalukOpen] = useState(false);
  const [talukHighlight, setTalukHighlight] = useState(-1);

  async function loadCasteIndex() {
    if (casteIndexRef.current !== null) return;
    const all = await getAllStudents();
    const seen = new Set<string>();
    const index: CasteEntry[] = [];
    for (const s of all) {
      const key = s.caste?.trim().toUpperCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        index.push({ caste: key, category: s.category });
      }
    }
    casteIndexRef.current = index;
  }

  function handleCasteChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase();
    handleFieldChange('caste', val);
    setCasteHighlight(-1);
    if (casteSuggestTimer.current) clearTimeout(casteSuggestTimer.current);
    if (!val.trim()) { setCasteSuggestions([]); setCasteOpen(false); return; }
    casteSuggestTimer.current = setTimeout(() => {
      const q = val.trim();
      const index = casteIndexRef.current;
      if (!index) { setCasteSuggestions([]); return; }
      const matches = index.filter(item => item.caste.includes(q) && item.caste !== q).slice(0, 2);
      setCasteSuggestions(matches);
      setCasteOpen(matches.length > 0);
    }, 150);
  }

  function handleCastePick(item: CasteEntry) {
    handleFieldChange('caste', item.caste);
    handleFieldChange('category', item.category);
    setCasteSuggestions([]);
    setCasteOpen(false);
    setCasteHighlight(-1);
  }

  function handleCasteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!casteOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCasteHighlight(h => Math.min(h + 1, casteSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCasteHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      const idx = casteHighlight >= 0 ? casteHighlight : 0;
      if (casteSuggestions[idx]) {
        e.preventDefault();
        handleCastePick(casteSuggestions[idx]);
      }
    } else if (e.key === 'Escape') {
      setCasteOpen(false);
    }
  }

  function handleTalukChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase();
    handleFieldChange('taluk', val);
    setTalukHighlight(-1);
    if (talukSuggestTimer.current) clearTimeout(talukSuggestTimer.current);
    if (!val.trim()) { setTalukSuggestions([]); setTalukOpen(false); return; }
    talukSuggestTimer.current = setTimeout(() => {
      const q = val.trim();
      const matches = KARNATAKA_TALUKS.filter(t => t.startsWith(q) && t !== q).slice(0, 8);
      setTalukSuggestions(matches);
      setTalukOpen(matches.length > 0);
    }, 100);
  }

  function handleTalukPick(taluk: string) {
    handleFieldChange('taluk', taluk);
    const district = KARNATAKA_TALUK_DISTRICT[taluk] ?? '';
    handleFieldChange('district', district);
    setTalukSuggestions([]);
    setTalukOpen(false);
    setTalukHighlight(-1);
  }

  function handleTalukKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!talukOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTalukHighlight(h => Math.min(h + 1, talukSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTalukHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      const idx = talukHighlight >= 0 ? talukHighlight : 0;
      if (talukSuggestions[idx]) {
        e.preventDefault();
        handleTalukPick(talukSuggestions[idx]);
      }
    } else if (e.key === 'Escape') {
      setTalukOpen(false);
    }
  }

  // Re-enroll from previous year
  const [reEnrollOpen, setReEnrollOpen] = useState(false);
  const [prevQuery, setPrevQuery] = useState('');
  const [prevResults, setPrevResults] = useState<Student[]>([]);
  const [prevSearching, setPrevSearching] = useState(false);
  const [prevSourceStudent, setPrevSourceStudent] = useState<Student | null>(null);
  const prevStudentsCache = useRef<Student[] | null>(null);

  // In edit mode: merge live-computed warnings with any blocking errors from submit attempt.
  // Warnings show red but don't block save; blocking errors (mandatory fields) take priority.
  const displayErrors = useMemo<ValidationErrors>(() => {
    if (!editId) return errors;
    const { warnings } = validateStudentFormEdit(form);
    return { ...warnings, ...errors };
  }, [editId, form, errors]);

  // Staff cannot access edit mode — redirect to students list
  useEffect(() => {
    if (editId && !isAdmin) {
      navigate('/students', { replace: true });
    }
  }, [editId, isAdmin, navigate]);

  useEffect(() => {
    if (!editId && settings?.currentAcademicYear) {
      setForm((prev) => ({ ...prev, academicYear: settings.currentAcademicYear }));
    }
  }, [settings, editId]);

  // Auto-preview unique default reg number for new enrollments.
  // Runs whenever course / year / academicYear change.
  // Skipped in edit mode or when using the "re-enroll from previous year" flow
  // (the previous student's reg number is preserved in those cases).
  // Only overwrites the field when it is empty, holds the old default (e.g. "308CE"),
  // or already shows a previous auto-preview — any manually typed custom value is kept.
  useEffect(() => {
    if (editId) return;
    if (prevSourceStudent) return; // re-enroll: preserve previous reg number
    const { course, year, academicYear } = form;
    if (!course || !year || !academicYear) return;

    const isAutoFillable =
      !form.regNumber ||
      form.regNumber === `308${course}` ||
      /^\d(CE|ME|EC|CS|EE)308\d{5}$/.test(form.regNumber);
    if (!isAutoFillable) return;

    let cancelled = false;
    peekNextDefaultRegNumber(academicYear as import('../types').AcademicYear, course as import('../types').Course, year as import('../types').Year)
      .then((preview) => {
        if (cancelled) return;
        setForm((prev) => {
          const stillAutoFillable =
            !prev.regNumber ||
            prev.regNumber === `308${prev.course}` ||
            /^\d(CE|ME|EC|CS|EE)308\d{5}$/.test(prev.regNumber);
          if (!stillAutoFillable) return prev;
          return { ...prev, regNumber: preview };
        });
      })
      .catch(() => {}); // network errors are silently ignored; regNumber stays as-is
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.course, form.year, form.academicYear, editId, prevSourceStudent]);

  // Debounced search across previous-year students
  useEffect(() => {
    if (editId) return;
    const trimmed = prevQuery.trim();
    if (trimmed.length < 2) {
      setPrevResults([]);
      setPrevSearching(false);
      return;
    }
    // Clear stale results immediately so the list doesn't freeze on old data
    setPrevResults([]);
    setPrevSearching(true);
    const timer = setTimeout(async () => {
      try {
        if (prevStudentsCache.current === null) {
          const all = await getAllStudents();
          prevStudentsCache.current = settings?.currentAcademicYear
            ? all.filter((s) => s.academicYear !== settings.currentAcademicYear)
            : all;
        }
        const q = trimmed.toUpperCase();
        const results = prevStudentsCache.current
          .filter(
            (s) =>
              s.studentNameSSLC.toUpperCase().includes(q) ||
              s.regNumber.toUpperCase().includes(q)
          )
          .slice(0, 8);
        setPrevResults(results);
      } catch {
        setPrevResults([]);
      } finally {
        setPrevSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [prevQuery, editId, settings?.currentAcademicYear]);

  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    getStudent(editId)
      .then((student) => {
        if (student) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _id, createdAt: _c, updatedAt: _u, motherMobile: _mm, ...rest } = student as Student & { motherMobile?: string };
          // Convert YYYY-MM-DD to DD/MM/YYYY if needed
          if (rest.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(rest.dateOfBirth)) {
            const [y, m, d] = rest.dateOfBirth.split('-');
            rest.dateOfBirth = `${d}/${m}/${y}`;
          }
          // Default missing fields for records predating these additions
          const formData = rest as StudentFormData;
          if (!formData.meritNumber) formData.meritNumber = '';
          if (!formData.regNumber) formData.regNumber = formData.course ? `308${formData.course}` : '';
          if (!formData.admType) formData.admType = 'REGULAR';
          if (!formData.admCat) formData.admCat = 'GM';
          setForm(formData);
          setEditOriginalYear({ year: formData.year, academicYear: formData.academicYear });
          setEditOriginalAdmCat(formData.admCat ?? null);
          setEditOriginalCourse(formData.course ?? null);
          // Fetch all other enrollment records for this student (for history display + year conflict check)
          getAllStudents().then((all) => {
            const history = all
              .filter((s) => {
                if (s.id === editId) return false;
                if (student.regNumber) {
                  return s.regNumber?.toUpperCase() === student.regNumber.toUpperCase();
                }
                return s.studentNameSSLC.toUpperCase() === student.studentNameSSLC.toUpperCase();
              })
              .sort((a, b) => a.academicYear.localeCompare(b.academicYear));
            setEnrollmentHistory(history);
          }).catch(() => {});
        }
      })
      .catch(() => setErrorMsg('Failed to load student data'))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  function handleFieldChange(field: keyof StudentFormData, value: string | number) {
    setForm((prev) => {
      const updated: StudentFormData = { ...prev, [field]: value };
      const newScienceMax = field === 'scienceMax' ? Number(value) : Number(prev.scienceMax);
      const newMathsMax = field === 'mathsMax' ? Number(value) : Number(prev.mathsMax);
      const newScienceObtained =
        field === 'scienceObtained' ? Number(value) : Number(prev.scienceObtained);
      const newMathsObtained =
        field === 'mathsObtained' ? Number(value) : Number(prev.mathsObtained);

      if (['scienceMax', 'mathsMax'].includes(field as string)) {
        updated.mathsScienceMaxTotal = newScienceMax + newMathsMax;
      }
      if (['scienceObtained', 'mathsObtained'].includes(field as string)) {
        updated.mathsScienceObtainedTotal = newScienceObtained + newMathsObtained;
      }
      // regNumber auto-preview is handled by a dedicated useEffect
      return updated;
    });

    if (errors[field as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    }
  }

  function handleTextChange(field: keyof StudentFormData) {
    return (e: ChangeEvent<HTMLInputElement>) => handleFieldChange(field, e.target.value);
  }

  function handleNumberChange(field: keyof StudentFormData) {
    return (e: ChangeEvent<HTMLInputElement>) => handleFieldChange(field, Number(e.target.value));
  }

  function handleSelectChange(field: keyof StudentFormData) {
    return (e: ChangeEvent<HTMLSelectElement>) => handleFieldChange(field, e.target.value);
  }

  function handlePrevStudentSelect(student: Student) {
    // Find the most recent enrollment for this student across all cached previous years
    const allRecords = (prevStudentsCache.current ?? []).filter((s) => {
      if (student.regNumber) {
        return s.regNumber?.toUpperCase() === student.regNumber.toUpperCase();
      }
      return s.studentNameSSLC.toUpperCase() === student.studentNameSSLC.toUpperCase();
    });
    const latest = allRecords.sort((a, b) => {
      const yearA = parseInt(a.academicYear.split('-')[0], 10);
      const yearB = parseInt(b.academicYear.split('-')[0], 10);
      return yearB - yearA;
    })[0] ?? student;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _c, updatedAt: _u, meritNumber: _m, ...rest } = latest;
    // Convert DOB from YYYY-MM-DD to DD/MM/YYYY if needed
    let dob = rest.dateOfBirth;
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      const [y, mo, d] = dob.split('-');
      dob = `${d}/${mo}/${y}`;
    }
    setForm({
      ...rest,
      dateOfBirth: dob,
      meritNumber: '',
      admissionStatus: '',
      academicYear: settings?.currentAcademicYear ?? ('' as AcademicYear),
    });
    setErrors({});
    setPrevSourceStudent(latest);
    setPrevQuery('');
    setPrevResults([]);
  }

  function handleClearPrevStudent() {
    setPrevSourceStudent(null);
    setForm(emptyForm(settings?.currentAcademicYear));
    setErrors({});
  }

  async function performSave() {
    setSaving(true);
    setErrorMsg('');
    try {
      // Duplicate guard: check if student already enrolled in the target academic year
      if (prevSourceStudent && form.academicYear) {
        const existing = await getStudentsByAcademicYear(form.academicYear as AcademicYear);
        const dup = existing.find((s) => {
          if (form.regNumber && s.regNumber) {
            return s.regNumber.toUpperCase() === form.regNumber.toUpperCase();
          }
          return s.studentNameSSLC.toUpperCase() === form.studentNameSSLC.toUpperCase();
        });
        if (dup) {
          setErrorMsg(
            `${form.studentNameSSLC} is already enrolled in ${form.academicYear} (Merit No: ${dup.meritNumber})`
          );
          return;
        }
      }
      if (editId) {
        await updateStudent(editId, form);
        // If course or year changed, update existing fee records to carry the new values
        if (
          editOriginalCourse !== null &&
          (form.course !== editOriginalCourse || form.year !== editOriginalYear?.year)
        ) {
          await applyCourseYearUpdate(
            editId,
            form.academicYear,
            editOriginalCourse as import('../types').Course,
            editOriginalYear!.year as import('../types').Year,
            form.course,
            form.year,
          );
        }
        // If Adm Cat changed, adjust existing fee records to reflect new structure
        if (editOriginalAdmCat && form.admCat !== editOriginalAdmCat) {
          await applyAdmCatFeeAdjustment(
            editId,
            form.academicYear,
            form.course,
            form.year,
            form.admType,
            editOriginalAdmCat,
            form.admCat,
          );
        }
        navigate(backTo, { state: { updatedName: form.studentNameSSLC }, replace: true });
      } else {
        const { meritNumber, regNumber } = await addStudent(form);
        setForm(emptyForm(settings?.currentAcademicYear));
        setPrevSourceStudent(null);
        setShowPreview(false);
        setSuccessMsg(`Student enrolled successfully! Merit No: ${meritNumber} · Reg No: ${regNumber}`);
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save student');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');
    if (editId) {
      // Edit mode: validate and save directly (no preview)
      const { errors: blockingErrors } = validateStudentFormEdit(form);
      if (Object.keys(blockingErrors).length > 0) {
        setErrors(blockingErrors);
        return;
      }
      setErrors({});
      // Warn if the year being saved matches a previous enrollment year
      const editConflict = enrollmentHistory.find((s) => s.year === form.year);
      if (editConflict) {
        setYearConflictRecord(editConflict);
        setShowYearWarning(true);
        return;
      }
      await performSave();
    } else {
      // New enrollment (manual or re-enroll): same mandatory fields for all paths
      const validationErrors = validateStudentForm(form);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      setErrors({});
      setShowPreview(true);
    }
  }

  // Called by the preview "Confirm & Enroll" button — checks year conflict for re-enroll before saving
  function handleConfirmEnroll() {
    if (prevSourceStudent && prevStudentsCache.current) {
      const prevRecords = prevStudentsCache.current.filter((s) => {
        if (prevSourceStudent.regNumber) {
          return s.regNumber?.toUpperCase() === prevSourceStudent.regNumber.toUpperCase();
        }
        return s.studentNameSSLC.toUpperCase() === form.studentNameSSLC.toUpperCase();
      });
      const conflict = prevRecords.find((s) => s.year === form.year);
      if (conflict) {
        setYearConflictRecord(conflict);
        setShowPreview(false);
        setShowYearWarning(true);
        return;
      }
    }
    void performSave();
  }

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading student data...</p>
      </div>
    );
  }

  return (
    <div className="w-full" ref={topRef} style={{ animation: 'page-enter 0.22s ease-out' }}>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold text-gray-900">
          {editId ? 'Edit Student' : 'Enroll Student'}
        </h2>
        <Button variant="secondary" size="sm" onClick={() => void navigate(backTo)}>
          {backLabel}
        </Button>
      </div>

      {successMsg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-5">{successMsg}</p>
      )}
      {errorMsg && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">{errorMsg}</p>
      )}

      {/* Re-enroll banner */}
      {!editId && (
        <div className="bg-sky-50 rounded-lg border border-sky-200 mb-5">
          <button
            type="button"
            onClick={() => setReEnrollOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-left"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-sky-800">Re-enroll from Previous Year</span>
              {prevSourceStudent && (
                <span className="text-xs text-sky-600 font-normal">
                  — {prevSourceStudent.studentNameSSLC}
                </span>
              )}
            </span>
            <svg
              className={`w-4 h-4 text-sky-600 transition-transform duration-200 ${reEnrollOpen || !!prevSourceStudent ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {(reEnrollOpen || !!prevSourceStudent) && (
            <div className="px-5 pb-4 border-t border-sky-200">
              {prevSourceStudent ? (
                <div className="flex items-center gap-3 flex-wrap pt-3">
                  <p className="text-sm text-sky-700">
                    Pre-filled from:{' '}
                    <span className="font-medium">{prevSourceStudent.studentNameSSLC}</span>
                    {' '}— {prevSourceStudent.course}, {prevSourceStudent.year},{' '}
                    {prevSourceStudent.academicYear}
                  </p>
                  <button
                    type="button"
                    onClick={handleClearPrevStudent}
                    className="text-xs text-red-600 hover:text-red-800 underline"
                  >
                    Clear &amp; start fresh
                  </button>
                </div>
              ) : (
                <div className="relative pt-3">
                  <p className="text-xs text-sky-600 mb-2">
                    Search by name or register number to pre-fill the form with an existing student's details.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={prevQuery}
                      onChange={(e) => setPrevQuery(e.target.value)}
                      placeholder="Type name or register number..."
                      className="block w-full max-w-sm rounded-md border border-sky-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <button
                      type="button"
                      onClick={() => { setForm(emptyForm(settings?.currentAcademicYear)); setErrors({}); setPrevQuery(''); setCasteSuggestions([]); setCasteOpen(false); }}
                      className="flex-shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-400 transition-colors"
                    >
                      Reset Fields
                    </button>
                  </div>
                  {prevSearching && (
                    <p className="text-xs text-sky-500 mt-1">Searching...</p>
                  )}
                  {prevQuery.trim().length >= 2 && !prevSearching && prevResults.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">No students found in previous years.</p>
                  )}
                  {prevResults.length > 0 && (
                    <ul className="absolute z-10 w-full max-w-sm bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-64 overflow-y-auto">
                      {prevResults.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => handlePrevStudentSelect(s)}
                            className="w-full text-left px-4 py-3 hover:bg-sky-50 border-b border-gray-100 last:border-0"
                          >
                            <p className="text-sm font-medium text-gray-900">{s.studentNameSSLC}</p>
                            <p className="text-xs text-gray-500">
                              {s.course} · {s.year} · {s.academicYear}
                              {s.regNumber ? ` · ${s.regNumber}` : ''}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">

        {/* ── Personal Information ─────────────────────────────────────── */}
        <section className="rounded-xl border border-blue-200 shadow-sm">
          <div className="bg-blue-100 px-6 py-2.5 border-b border-blue-200 rounded-t-xl">
            <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider">Personal Information</h3>
          </div>
          <div className="bg-blue-50 px-6 py-5 rounded-b-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <Input
                  label="Name as per SSLC"
                  value={form.studentNameSSLC}
                  onChange={handleTextChange('studentNameSSLC')}
                  error={displayErrors['studentNameSSLC']}
                  uppercase
                  placeholder="STUDENT NAME (SSLC)"
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="Name as per Aadhar"
                  value={form.studentNameAadhar}
                  onChange={handleTextChange('studentNameAadhar')}
                  error={displayErrors['studentNameAadhar']}
                  uppercase
                  placeholder="STUDENT NAME (AADHAR)"
                />
              </div>
              <Input
                label="Father Name"
                value={form.fatherName}
                onChange={handleTextChange('fatherName')}
                error={displayErrors['fatherName']}
                uppercase
                placeholder="FATHER NAME"
              />
              <Input
                label="Mother Name"
                value={form.motherName}
                onChange={handleTextChange('motherName')}
                error={displayErrors['motherName']}
                uppercase
                placeholder="MOTHER NAME"
              />
              <Input
                label="Date of Birth"
                value={form.dateOfBirth}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^\d/]/g, '');
                  const raw = val.replace(/\//g, '');
                  if (raw.length >= 3 && !val.includes('/')) {
                    val = raw.slice(0, 2) + '/' + raw.slice(2);
                  }
                  if (raw.length >= 5 && val.split('/').length < 3) {
                    const parts = val.split('/');
                    val = parts[0] + '/' + (parts[1] ?? '').slice(0, 2) + '/' + (parts[1] ?? '').slice(2) + (parts[2] ?? '');
                  }
                  if (val.length > 10) val = val.slice(0, 10);
                  handleFieldChange('dateOfBirth', val);
                }}
                error={displayErrors['dateOfBirth']}
                placeholder="DD/MM/YYYY"
                maxLength={10}
              />
              <Select
                label="Gender"
                options={GENDER_OPTIONS}
                value={form.gender}
                onChange={handleSelectChange('gender')}
                error={displayErrors['gender']}
                placeholder="Select gender"
              />
              <Select
                label="Religion"
                options={RELIGION_OPTIONS}
                value={form.religion}
                onChange={handleSelectChange('religion')}
                error={displayErrors['religion']}
                placeholder="Select religion"
              />
              <div className="flex flex-col gap-1 relative">
                <label className="text-sm font-medium text-gray-700">Caste Name</label>
                <input
                  type="text"
                  value={form.caste}
                  onChange={handleCasteChange}
                  onKeyDown={handleCasteKeyDown}
                  onFocus={() => void loadCasteIndex()}
                  onBlur={() => { casteSuggestTimer.current && clearTimeout(casteSuggestTimer.current); setCasteOpen(false); setCasteHighlight(-1); }}
                  placeholder="CASTE"
                  style={{ textTransform: 'uppercase' }}
                  className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm bg-inherit placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${displayErrors['caste'] ? 'border-red-500' : 'border-gray-300'}`}
                />
                {displayErrors['caste'] && <p className="text-xs text-red-600">{displayErrors['caste']}</p>}
                {casteOpen && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-md shadow-lg mt-0.5 overflow-hidden">
                    {casteSuggestions.map((item, idx) => (
                      <button
                        key={item.caste}
                        type="button"
                        onMouseDown={() => handleCastePick(item)}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-2 ${idx === casteHighlight ? 'bg-blue-50 text-blue-700' : 'hover:bg-blue-50 text-gray-800'}`}
                      >
                        <span className="font-medium">{item.caste}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Select
                label="Category"
                options={CATEGORY_OPTIONS}
                value={form.category}
                onChange={handleSelectChange('category')}
                error={displayErrors['category']}
              />
              <Input
                label="Annual Income (₹)"
                type="number"
                min={0}
                value={form.annualIncome}
                onChange={handleNumberChange('annualIncome')}
                error={displayErrors['annualIncome']}
                placeholder="0"
              />
            </div>
          </div>
        </section>

        {/* ── Contact Details ──────────────────────────────────────────── */}
        <section className="rounded-xl border border-emerald-200 shadow-sm">
          <div className="bg-emerald-100 px-6 py-2.5 border-b border-emerald-200 rounded-t-xl">
            <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Contact Details</h3>
          </div>
          <div className="bg-emerald-50 px-6 py-5 rounded-b-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <Input
                  label="Father Mobile"
                  value={form.fatherMobile}
                  onChange={handleTextChange('fatherMobile')}
                  error={displayErrors['fatherMobile']}
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="Student Mobile"
                  value={form.studentMobile}
                  onChange={handleTextChange('studentMobile')}
                  error={displayErrors['studentMobile']}
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                />
              </div>
              <div className="lg:col-span-4">
                <Input
                  label="Address"
                  value={form.address}
                  onChange={handleTextChange('address')}
                  error={displayErrors['address']}
                  uppercase
                  placeholder="DOOR NO. / STREET / LOCALITY"
                />
              </div>
              <Input
                label={`Town / City${form.address.trim() ? ' *' : ''}`}
                value={form.town}
                onChange={handleTextChange('town')}
                error={displayErrors['town']}
                uppercase
                placeholder="TOWN / CITY"
              />
              <div className="flex flex-col gap-1 relative">
                <label className="text-sm font-medium text-gray-700">
                  {`Taluk${form.address.trim() ? ' *' : ''}`}
                </label>
                <input
                  type="text"
                  value={form.taluk}
                  onChange={handleTalukChange}
                  onKeyDown={handleTalukKeyDown}
                  onBlur={() => { talukSuggestTimer.current && clearTimeout(talukSuggestTimer.current); setTalukOpen(false); setTalukHighlight(-1); }}
                  placeholder="TALUK"
                  style={{ textTransform: 'uppercase' }}
                  className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm bg-inherit placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${displayErrors['taluk'] ? 'border-red-500' : 'border-gray-300'}`}
                />
                {displayErrors['taluk'] && <p className="text-xs text-red-600">{displayErrors['taluk']}</p>}
                {talukOpen && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-md shadow-lg mt-0.5 overflow-hidden">
                    {talukSuggestions.map((taluk, idx) => (
                      <button
                        key={taluk}
                        type="button"
                        onMouseDown={() => handleTalukPick(taluk)}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-2 ${idx === talukHighlight ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-800'}`}
                      >
                        <span className="font-medium">{taluk}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{KARNATAKA_TALUK_DISTRICT[taluk]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                label={`District${form.address.trim() ? ' *' : ''}`}
                value={form.district}
                onChange={handleTextChange('district')}
                error={displayErrors['district']}
                uppercase
                placeholder="AUTO-FILLED FROM TALUK"
              />
            </div>
          </div>
        </section>

        {/* ── SSLC Marks ───────────────────────────────────────────────── */}
        <section className="rounded-xl border border-amber-200 overflow-hidden shadow-sm">
          <div className="bg-amber-100 px-6 py-2.5 border-b border-amber-200">
            <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider">SSLC Marks</h3>
          </div>
          <div className="bg-amber-50 px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <Select
                  label="10th Board"
                  options={TENTH_BOARD_OPTIONS}
                  value={form.tenthBoard}
                  onChange={handleSelectChange('tenthBoard')}
                />
              </div>
              <div className="lg:col-span-2">
                <Select
                  label="Prior Qualification"
                  options={PRIOR_QUALIFICATION_OPTIONS}
                  value={form.priorQualification}
                  onChange={handleSelectChange('priorQualification')}
                />
              </div>
              {form.priorQualification === 'PUC' && (
                <div className="lg:col-span-2">
                  <Input
                    label="PUC Percentage (%)"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.pucPercentage || ''}
                    onChange={handleNumberChange('pucPercentage')}
                    error={displayErrors['pucPercentage']}
                    placeholder="e.g. 78.50"
                  />
                </div>
              )}
              {form.priorQualification === 'ITI' && (
                <div className="lg:col-span-2">
                  <Input
                    label="ITI Percentage (%)"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.itiPercentage || ''}
                    onChange={handleNumberChange('itiPercentage')}
                    error={displayErrors['itiPercentage']}
                    placeholder="e.g. 82.00"
                  />
                </div>
              )}
              <div className="lg:col-span-2">
                <Input
                  label="SSLC Max Total"
                  type="number"
                  min={0}
                  value={form.sslcMaxTotal}
                  onChange={handleNumberChange('sslcMaxTotal')}
                  error={displayErrors['sslcMaxTotal']}
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="SSLC Obtained Total"
                  type="number"
                  min={0}
                  value={form.sslcObtainedTotal}
                  onChange={handleNumberChange('sslcObtainedTotal')}
                  error={displayErrors['sslcObtainedTotal']}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="text-sm font-medium text-gray-700 block mb-1">SSLC Percentage</label>
                <input
                  type="text"
                  readOnly
                  value={
                    form.sslcMaxTotal > 0
                      ? `${((form.sslcObtainedTotal / form.sslcMaxTotal) * 100).toFixed(2)}%`
                      : '—'
                  }
                  className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                />
              </div>
              <Input
                label="Science Max"
                type="number"
                min={0}
                value={form.scienceMax}
                onChange={handleNumberChange('scienceMax')}
                error={displayErrors['scienceMax']}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 text-gray-400 cursor-default select-none"
              />
              <Input
                label="Science Obtained"
                type="number"
                min={0}
                value={form.scienceObtained}
                onChange={handleNumberChange('scienceObtained')}
                error={displayErrors['scienceObtained']}
              />
              <Input
                label="Maths Max"
                type="number"
                min={0}
                value={form.mathsMax}
                onChange={handleNumberChange('mathsMax')}
                error={displayErrors['mathsMax']}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 text-gray-400 cursor-default select-none"
              />
              <Input
                label="Maths Obtained"
                type="number"
                min={0}
                value={form.mathsObtained}
                onChange={handleNumberChange('mathsObtained')}
                error={displayErrors['mathsObtained']}
              />
              <div className="lg:col-span-2">
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Maths + Science Max Total
                </label>
                <input
                  type="number"
                  readOnly
                  value={form.mathsScienceMaxTotal}
                  className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Maths + Science Obtained Total
                </label>
                <input
                  type="number"
                  readOnly
                  value={form.mathsScienceObtainedTotal}
                  className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Enrollment Details ───────────────────────────────────────── */}
        <section className="rounded-xl border border-violet-200 overflow-hidden shadow-sm">
          <div className="bg-violet-100 px-6 py-2.5 border-b border-violet-200">
            <h3 className="text-sm font-bold text-violet-800 uppercase tracking-wider">Enrollment Details</h3>
          </div>
          <div className="bg-violet-50 px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <Select
                  label="Course"
                  options={COURSE_OPTIONS}
                  value={form.course}
                  onChange={handleSelectChange('course')}
                  error={displayErrors['course']}
                  placeholder="Select course"
                />
              </div>
              <div className="lg:col-span-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-700">Year</span>
                    {prevSourceStudent && (
                      <span className="text-xs text-amber-600 font-medium">
                        Previously: {prevSourceStudent.year} ({prevSourceStudent.academicYear})
                      </span>
                    )}
                    {editId && editOriginalYear && (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1 flex-wrap">
                        {enrollmentHistory.map((r) => (
                          <span key={r.id} className="flex items-center gap-1">
                            <span>{r.year} ({r.academicYear})</span>
                            <span className="text-gray-400">→</span>
                          </span>
                        ))}
                        <span>{editOriginalYear.year} ({editOriginalYear.academicYear})</span>
                      </span>
                    )}
                  </div>
                  <Select
                    options={YEAR_OPTIONS}
                    value={form.year}
                    onChange={handleSelectChange('year')}
                    error={displayErrors['year']}
                    placeholder="Select year"
                  />
                </div>
              </div>
              <Select
                label="Adm Type"
                options={ADM_TYPE_OPTIONS}
                value={form.admType}
                onChange={handleSelectChange('admType')}
                error={displayErrors['admType']}
              />
              <Select
                label="Adm Cat"
                options={ADM_CAT_OPTIONS}
                value={form.admCat}
                onChange={handleSelectChange('admCat')}
                error={displayErrors['admCat']}
              />
              <Select
                label="Academic Year"
                options={ACADEMIC_YEAR_OPTIONS}
                value={form.academicYear}
                onChange={handleSelectChange('academicYear')}
                error={displayErrors['academicYear']}
                placeholder="Select academic year"
              />
              <Select
                label="Admission Status"
                options={ADMISSION_STATUS_OPTIONS}
                value={form.admissionStatus}
                onChange={handleSelectChange('admissionStatus')}
                error={displayErrors['admissionStatus']}
                placeholder="Select status"
              />
              <Input
                label="Reg Number"
                value={form.regNumber}
                onChange={handleTextChange('regNumber')}
                error={displayErrors['regNumber']}
                uppercase
                placeholder="Auto-assigned if blank"
              />
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Merit Number
                </label>
                {editId ? (
                  <input
                    readOnly
                    value={form.meritNumber || 'Not assigned'}
                    className="block w-full rounded-md border border-violet-200 px-3 py-2 text-sm bg-violet-100/60 text-gray-600 cursor-not-allowed font-mono tracking-wider"
                  />
                ) : (
                  <input
                    readOnly
                    value=""
                    placeholder="Auto-generated on enrollment"
                    className="block w-full rounded-md border border-violet-200 px-3 py-2 text-sm bg-violet-100/60 text-gray-400 cursor-not-allowed italic"
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-3 pt-1 pb-4">
          <Button type="submit" loading={saving} size="lg">
            {editId ? 'Update Student' : 'Preview & Enroll'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => void navigate(backTo)}
          >
            Cancel
          </Button>
        </div>
      </form>

      {showPreview && (
        <EnrollmentPreview
          form={form}
          saving={saving}
          errorMsg={errorMsg}
          onConfirm={handleConfirmEnroll}
          onEdit={() => setShowPreview(false)}
        />
      )}

      {showYearWarning && yearConflictRecord && (
        <YearWarningModal
          studentName={form.studentNameSSLC}
          selectedYear={form.year}
          conflictRecord={yearConflictRecord}
          onProceed={() => { setShowYearWarning(false); setYearConflictRecord(null); void performSave(); }}
          onEdit={() => { setShowYearWarning(false); setYearConflictRecord(null); }}
        />
      )}
    </div>
  );
}
