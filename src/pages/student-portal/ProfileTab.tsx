import type { Student } from '../../types';

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-tight mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 break-words">{value || '—'}</dd>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <h4 className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-3 ${accent}`}>
        {title}
      </h4>
      {children}
    </div>
  );
}

export function ProfileTab({ student: s }: { student: Student }) {
  const sslcPct = s.sslcMaxTotal > 0 ? ((s.sslcObtainedTotal / s.sslcMaxTotal) * 100).toFixed(1) : null;
  const msPct = s.mathsScienceMaxTotal > 0 ? ((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100).toFixed(1) : null;

  const admStatusColor =
    s.admissionStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    s.admissionStatus === 'CANCELLED' ? 'bg-red-100 text-red-700 border-red-200' :
    'bg-yellow-100 text-yellow-700 border-yellow-200';

  return (
    <div className="space-y-3">
      <Section title="Academic Details" accent="bg-emerald-50 text-emerald-700">
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

      <Section title="Personal Information" accent="bg-blue-50 text-blue-700">
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

      <Section title="Contact Details" accent="bg-violet-50 text-violet-700">
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

      <Section title="Marks Details" accent="bg-amber-50 text-amber-700">
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
