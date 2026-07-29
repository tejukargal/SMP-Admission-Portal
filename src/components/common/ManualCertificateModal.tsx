import { useState, useEffect } from 'react';
import type { Course, Gender, AcademicYear } from '../../types';
import { ACADEMIC_YEARS } from '../../types';
import { useSettings } from '../../hooks/useSettings';
import { buildSyntheticStudent, type ManualCertFormData } from '../../utils/manualCertificate';
import {
  buildStudyCertHTML,
  generateStudyCertificate,
  getDefaultBodyText,
  type CertificateType,
  type StudyCertOptions,
} from '../../utils/studyCertificate';
import {
  generateProvisionalCertificate,
  type PCFormData,
} from '../../utils/provisionalCertificate';

interface Props {
  onClose: () => void;
}

type CertKind = 'STUDY' | 'PROVISIONAL';

const COURSE_OPTIONS: { value: Course; label: string }[] = [
  { value: 'EE', label: 'Electrical & Electronics Engineering' },
  { value: 'CE', label: 'Civil Engineering' },
  { value: 'ME', label: 'Mechanical Engineering' },
  { value: 'EC', label: 'Electronics & Communication Engineering' },
  { value: 'CS', label: 'Computer Science & Engineering' },
];

const STUDY_OPTIONS: { type: CertificateType; label: string; desc: string; icon: string }[] = [
  { type: 'STUDYING',  label: 'Currently Studying', desc: 'Student is enrolled and currently attending', icon: '📚' },
  { type: 'COMPLETED', label: 'Course Completed',   desc: 'Student has completed the diploma programme', icon: '🎓' },
  { type: 'CANCELLED', label: 'Discontinued',       desc: 'Student left before completing the course',   icon: '📋' },
];

const RESULT_CLASSES = ['DISTINCTION', 'FIRST CLASS', 'SECOND CLASS', 'PASS CLASS'];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatToday() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function isoToDDMMYYYY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const inp = 'w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';
const label = 'block text-xs font-medium text-gray-700 mb-1';

export function ManualCertificateModal({ onClose }: Props) {
  const { settings } = useSettings();
  const defaultAcademicYear: AcademicYear = settings?.currentAcademicYear ?? ACADEMIC_YEARS[ACADEMIC_YEARS.length - 1];

  const [certKind, setCertKind] = useState<CertKind>('STUDY');

  // Shared manual fields
  const [studentName, setStudentName] = useState('');
  const [fatherName,  setFatherName]  = useState('');
  const [regNumber,   setRegNumber]   = useState('');
  const [course,      setCourse]      = useState<Course>('EE');
  const [year,        setYear]        = useState<'2ND YEAR' | '3RD YEAR'>('2ND YEAR');
  const [academicYear, setAcademicYear] = useState<AcademicYear>(defaultAcademicYear);
  const [gender,      setGender]      = useState<Gender>('BOY');

  // Study Certificate options
  const [studyType,     setStudyType]     = useState<CertificateType>('STUDYING');
  const [includeCaste,  setIncludeCaste]  = useState(false);
  const [casteName,     setCasteName]     = useState('');
  const [casteCategory, setCasteCategory] = useState('');

  // Provisional Certificate fields
  const [dateIssueISO, setDateIssueISO] = useState(todayISO);
  const [examPeriod,   setExamPeriod]   = useState('');
  const [resultClass,  setResultClass]  = useState('FIRST CLASS');

  // Preview / edit (Study Certificate only)
  const [previewHtml, setPreviewHtml] = useState('');
  const [editMode,    setEditMode]    = useState(false);
  const [editDate,    setEditDate]    = useState('');
  const [editBody,    setEditBody]    = useState('');
  const [editExtra,   setEditExtra]   = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const formData: ManualCertFormData = {
    studentName, fatherName, regNumber, course, year, academicYear, gender,
  };

  const canGenerate =
    studentName.trim() !== '' &&
    fatherName.trim() !== '' &&
    regNumber.trim() !== '' &&
    (certKind === 'STUDY' || (dateIssueISO !== '' && examPeriod.trim() !== ''));

  function casteOpts(): StudyCertOptions {
    return { includeCaste, casteName, casteCategory };
  }

  function handlePreviewStudy() {
    const student = buildSyntheticStudent(formData);
    setPreviewHtml(buildStudyCertHTML(student, studyType, casteOpts()));
  }

  function handlePrintStudy() {
    const student = buildSyntheticStudent(formData);
    generateStudyCertificate(student, studyType, casteOpts());
    onClose();
  }

  function handleOpenEdit() {
    const student = buildSyntheticStudent(formData);
    setEditDate(formatToday());
    setEditBody(getDefaultBodyText(student, studyType, casteOpts()));
    setEditExtra('');
    setEditMode(true);
  }

  function handleApplyEdits() {
    const student = buildSyntheticStudent(formData);
    const html = buildStudyCertHTML(student, studyType, {
      ...casteOpts(),
      customDate:  editDate.trim() || undefined,
      customBody:  editBody,
      customExtra: editExtra.trim() || undefined,
    });
    setPreviewHtml(html);
    setEditMode(false);
  }

  function handlePrintEdited() {
    const student = buildSyntheticStudent(formData);
    generateStudyCertificate(student, studyType, {
      ...casteOpts(),
      customDate:  editDate.trim() || undefined,
      customBody:  editBody,
      customExtra: editExtra.trim() || undefined,
    });
    onClose();
  }

  function handlePrintProvisional() {
    if (!canGenerate) return;
    const student = buildSyntheticStudent(formData);
    const data: PCFormData = {
      dateOfIssue: isoToDDMMYYYY(dateIssueISO),
      examPeriod:  examPeriod.trim(),
      regNumber:   regNumber.trim(),
      resultClass,
      isDuplicate: false,
    };
    generateProvisionalCertificate(student, data);
    onClose();
  }

  const CERT_LABELS: Record<CertificateType, string> = {
    STUDYING:  'Currently Studying',
    COMPLETED: 'Course Completed',
    CANCELLED: 'Discontinued',
  };

  // ── Study Certificate: Edit mode ────────────────────────────────────────────
  if (certKind === 'STUDY' && previewHtml && editMode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div
          className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: '860px', maxWidth: '100%', maxHeight: 'calc(100vh - 3rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-3.5 bg-gradient-to-r from-amber-600 to-amber-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
              <h2 className="text-sm font-bold text-white">Edit Certificate</h2>
              <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 truncate max-w-xs">
                {studentName}
              </span>
              <span className="inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 bg-amber-400/30 text-amber-100 border border-amber-300/30 shrink-0">
                {CERT_LABELS[studyType]}
              </span>
            </div>
            <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3">×</button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Date</label>
              <input
                type="text"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                placeholder="e.g. 15 March 2025"
                className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Certificate Body</label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-y font-serif"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Additional Text <span className="font-normal text-gray-400 normal-case">(optional)</span></label>
              <textarea
                value={editExtra}
                onChange={(e) => setEditExtra(e.target.value)}
                rows={3}
                placeholder="Type any extra paragraphs to append after the body…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-y font-serif"
              />
            </div>
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-between">
            <button onClick={() => setEditMode(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
              Back
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                Close
              </button>
              <button onClick={handleApplyEdits} className="rounded-lg border border-amber-400 bg-amber-50 text-amber-800 px-4 py-1.5 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer">
                Preview
              </button>
              <button onClick={handlePrintEdited} className="rounded-lg bg-slate-700 text-white px-4 py-1.5 text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer">
                Print
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Study Certificate: Preview mode ─────────────────────────────────────────
  if (certKind === 'STUDY' && previewHtml) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div
          className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: '860px', maxWidth: '100%', maxHeight: 'calc(100vh - 3rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-3.5 bg-gradient-to-r from-slate-700 to-slate-900 flex items-center justify-between shrink-0">
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white">Print Preview — Study Certificate</h2>
              <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 truncate max-w-xs">
                {studentName}
              </span>
              <span className="inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 bg-blue-500/30 text-blue-100 border border-blue-400/30 shrink-0">
                {CERT_LABELS[studyType]}
              </span>
            </div>
            <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3">×</button>
          </div>

          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 shrink-0">
            <span className="text-xs text-blue-700">Prints on a single A4 sheet. Verify all details before printing.</span>
          </div>

          <div className="flex-1 overflow-auto min-h-0 bg-slate-300">
            <iframe
              srcDoc={previewHtml}
              title="Study Certificate Print Preview"
              scrolling="no"
              className="w-full border-0 block"
              style={{ height: '1250px' }}
            />
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-between">
            <button onClick={() => setPreviewHtml('')} className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
              Back
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                Close
              </button>
              <button onClick={handleOpenEdit} className="rounded-lg border border-amber-400 bg-amber-50 text-amber-800 px-4 py-1.5 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer" title="Edit date and body text">
                Edit
              </button>
              <button onClick={handlePrintStudy} className="rounded-lg bg-slate-700 text-white px-4 py-1.5 text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer">
                Print
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form (both certificate kinds) ───────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Manual Certificate</h3>
              <p className="text-xs text-gray-500 mt-0.5">For Evening College / Working Professional students with no database record</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 flex-shrink-0" aria-label="Close">×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

          {/* Certificate kind selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setCertKind('STUDY')}
              className={`text-left px-3 py-2 rounded-lg border transition-all ${
                certKind === 'STUDY' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className={`text-sm font-medium ${certKind === 'STUDY' ? 'text-blue-700' : 'text-gray-800'}`}>Study Certificate</div>
            </button>
            <button
              onClick={() => setCertKind('PROVISIONAL')}
              className={`text-left px-3 py-2 rounded-lg border transition-all ${
                certKind === 'PROVISIONAL' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className={`text-sm font-medium ${certKind === 'PROVISIONAL' ? 'text-blue-700' : 'text-gray-800'}`}>Provisional Certificate</div>
            </button>
          </div>

          {/* Student details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={label}>Student Name <span className="text-red-500">*</span></label>
              <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value.toUpperCase())} placeholder="e.g. RAMESH KUMAR" className={inp} />
            </div>
            <div className="col-span-2">
              <label className={label}>Father's Name <span className="text-red-500">*</span></label>
              <input type="text" value={fatherName} onChange={(e) => setFatherName(e.target.value.toUpperCase())} placeholder="e.g. SURESH KUMAR" className={inp} />
            </div>
            <div>
              <label className={label}>Register No. <span className="text-red-500">*</span></label>
              <input type="text" value={regNumber} onChange={(e) => setRegNumber(e.target.value.toUpperCase())} placeholder="e.g. 308EE24001" className={inp} />
            </div>
            <div>
              <label className={label}>Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className={inp}>
                <option value="BOY">BOY</option>
                <option value="GIRL">GIRL</option>
              </select>
            </div>
            <div>
              <label className={label}>Course</label>
              <select value={course} onChange={(e) => setCourse(e.target.value as Course)} className={inp}>
                {COURSE_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.value} — {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Year</label>
              <select value={year} onChange={(e) => setYear(e.target.value as '2ND YEAR' | '3RD YEAR')} className={inp}>
                <option value="2ND YEAR">2ND YEAR</option>
                <option value="3RD YEAR">3RD YEAR</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={label}>Academic Year</label>
              <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value as AcademicYear)} className={inp}>
                {ACADEMIC_YEARS.map((ay) => (
                  <option key={ay} value={ay}>{ay}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            Working Professional / Evening College students are treated as Lateral Entry (direct admission to 2nd Year, 2-year course) — the certificate wording reflects this automatically.
          </div>

          {/* Study Certificate options */}
          {certKind === 'STUDY' && (
            <>
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Select the certificate type to generate:</p>
                {STUDY_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => setStudyType(opt.type)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                      studyType === opt.type ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-lg leading-none">{opt.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium ${studyType === opt.type ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</div>
                      <div className="text-xs text-gray-400 truncate">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIncludeCaste((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Include Caste &amp; Category</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Adds a line about the student's caste and category</p>
                  </div>
                  <div className={`relative rounded-full transition-colors flex-shrink-0 ${includeCaste ? 'bg-blue-600' : 'bg-gray-300'}`} style={{ height: '18px', width: '32px' }}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${includeCaste ? 'translate-x-[14px]' : 'translate-x-0.5'}`} />
                  </div>
                </button>
                {includeCaste && (
                  <div className="px-3 py-3 border-t border-gray-200 space-y-2.5 bg-white">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Caste Name</label>
                        <input type="text" value={casteName} onChange={(e) => setCasteName(e.target.value)} placeholder="e.g. Vokkaliga" className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div className="w-28">
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Category</label>
                        <input type="text" value={casteCategory} onChange={(e) => setCasteCategory(e.target.value.toUpperCase())} placeholder="e.g. 3A" maxLength={10} className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Provisional Certificate fields */}
          {certKind === 'PROVISIONAL' && (
            <>
              <div>
                <label className={label}>Date of Issue <span className="text-red-500">*</span></label>
                <input type="date" value={dateIssueISO} onChange={(e) => setDateIssueISO(e.target.value)} className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Exam Held During <span className="text-red-500">*</span></label>
                  <input type="text" value={examPeriod} onChange={(e) => setExamPeriod(e.target.value.toUpperCase())} placeholder="e.g. MAY-2024" className={inp} />
                </div>
                <div>
                  <label className={label}>Result Class</label>
                  <select value={resultClass} onChange={(e) => setResultClass(e.target.value)} className={inp}>
                    {RESULT_CLASSES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                <strong>Note:</strong> This certificate is only to be issued to students who have passed all subjects — for these Lateral Entry (Working Professional) students, this means both the 2nd and 3rd Year.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex justify-end gap-2 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          {certKind === 'STUDY' ? (
            <button
              onClick={handlePreviewStudy}
              disabled={!canGenerate || (includeCaste && (!casteName.trim() || !casteCategory.trim()))}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Preview &amp; Print
            </button>
          ) : (
            <button
              onClick={handlePrintProvisional}
              disabled={!canGenerate}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
