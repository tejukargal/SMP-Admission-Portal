import type { Student } from '../../types';

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-tight mb-0.5">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 break-words">{value || '—'}</dd>
    </div>
  );
}

function Section({ title, icon, index, children }: { title: string; icon: React.ReactNode; index: number; children: React.ReactNode }) {
  return (
    <div
      style={{ animation: 'content-enter 0.3s ease-out both', animationDelay: `${Math.min(index, 12) * 0.05}s` }}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-50 border-gray-200">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm bg-gray-900 text-white">
          {icon}
        </span>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">{title}</h4>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

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
      <Section title="Academic Details" icon={SECTION_ICONS.academic} index={0}>
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

      <Section title="Personal Information" icon={SECTION_ICONS.personal} index={1}>
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

      <Section title="Contact Details" icon={SECTION_ICONS.contact} index={2}>
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

      <Section title="Marks Details" icon={SECTION_ICONS.marks} index={3}>
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
