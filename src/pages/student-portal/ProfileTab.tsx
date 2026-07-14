import type { Student } from '../../types';

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-tight mb-0.5">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 break-words">{value || '—'}</dd>
    </div>
  );
}

function Section({ title, accent, icon, children }: { title: string; accent: { band: string; chip: string; text: string }; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${accent.band}`}>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-sm ${accent.chip}`}>
          {icon}
        </span>
        <h4 className={`text-xs font-bold uppercase tracking-wider ${accent.text}`}>{title}</h4>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

// Literal per-section pastel tokens — Tailwind 4 scans source text, so these must stay literal strings.
const SECTION_ACCENT = {
  academic: { band: 'bg-indigo-50 border-indigo-100', chip: 'bg-indigo-100 text-indigo-600', text: 'text-indigo-800' },
  personal: { band: 'bg-sky-50 border-sky-100', chip: 'bg-sky-100 text-sky-600', text: 'text-sky-800' },
  contact: { band: 'bg-violet-50 border-violet-100', chip: 'bg-violet-100 text-violet-600', text: 'text-violet-800' },
  marks: { band: 'bg-amber-50 border-amber-100', chip: 'bg-amber-100 text-amber-600', text: 'text-amber-800' },
} as const;

const SECTION_ICONS = {
  academic: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>,
  personal: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  contact: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  marks: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
};

export function ProfileTab({ student: s }: { student: Student }) {
  const sslcPct = s.sslcMaxTotal > 0 ? ((s.sslcObtainedTotal / s.sslcMaxTotal) * 100).toFixed(1) : null;
  const msPct = s.mathsScienceMaxTotal > 0 ? ((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100).toFixed(1) : null;

  const admStatusColor =
    s.admissionStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    s.admissionStatus === 'CANCELLED' ? 'bg-red-100 text-red-700 border-red-200' :
    'bg-amber-100 text-amber-700 border-amber-200';

  return (
    <div className="space-y-3">
      <Section title="Academic Details" accent={SECTION_ACCENT.academic} icon={SECTION_ICONS.academic}>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5">
          <Field label="Course" value={s.course} />
          <Field label="Study Year" value={s.year} />
          <Field label="Academic Year" value={s.academicYear} />
          <div>
            <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-tight mb-0.5">Admission Status</dt>
            <dd>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${admStatusColor}`}>
                {s.admissionStatus}
              </span>
            </dd>
          </div>
          <Field label="Admission Type" value={s.admType} />
          <Field label="Admission Category" value={s.admCat} />
          <Field label="Register Number" value={s.regNumber} />
          <Field label="Merit Number" value={s.meritNumber} />
        </dl>
      </Section>

      <Section title="Personal Information" accent={SECTION_ACCENT.personal} icon={SECTION_ICONS.personal}>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5">
          <Field label="Name (SSLC)" value={s.studentNameSSLC} />
          <Field label="Name (Aadhaar)" value={s.studentNameAadhar} />
          <Field label="Date of Birth" value={s.dateOfBirth ? s.dateOfBirth.split('-').reverse().join('-') : ''} />
          <Field label="Gender" value={s.gender} />
          <Field label="Religion" value={s.religion} />
          <Field label="Caste" value={s.caste} />
          <Field label="Category" value={s.category} />
        </dl>
      </Section>

      <Section title="Contact Details" accent={SECTION_ACCENT.contact} icon={SECTION_ICONS.contact}>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5">
          <Field label="Father's Name" value={s.fatherName} />
          <Field label="Mother's Name" value={s.motherName} />
          <Field label="Father Mobile" value={s.fatherMobile} />
          <Field label="Student Mobile" value={s.studentMobile} />
          <div className="col-span-2 sm:col-span-4">
            <Field label="Address" value={`${s.address}${s.town ? ', ' + s.town : ''}${s.taluk ? ', ' + s.taluk : ''}${s.district ? ', ' + s.district : ''}`} />
          </div>
        </dl>
      </Section>

      <Section title="Marks Details" accent={SECTION_ACCENT.marks} icon={SECTION_ICONS.marks}>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5">
          <Field label="10th Board" value={s.tenthBoard} />
          <Field label="SSLC" value={`${s.sslcObtainedTotal || '—'} / ${s.sslcMaxTotal || '—'}${sslcPct ? ` (${sslcPct}%)` : ''}`} />
          <Field label="Maths + Science" value={`${s.mathsScienceObtainedTotal || '—'} / ${s.mathsScienceMaxTotal || '—'}${msPct ? ` (${msPct}%)` : ''}`} />
          {s.priorQualification !== 'NONE' && (
            <Field
              label={s.priorQualification}
              value={`${s.priorQualification === 'ITI' ? s.itiPercentage : s.pucPercentage || '—'}%`}
            />
          )}
        </dl>
      </Section>
    </div>
  );
}
