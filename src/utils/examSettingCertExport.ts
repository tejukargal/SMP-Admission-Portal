import type { ExamSettingCertificate } from '../types';
import { loadXlsx } from './lazyLibs';
import { dmy } from './examDutyCertificate';
import { settingCertBodyText, subjectTotals, WORK_LABELS } from './examSettingCertificate';

/** Issued Setting & Conducting certificate register (any selection) as .xlsx. */
export async function exportSettingCertsXlsx(certs: ExamSettingCertificate[], fileStem: string): Promise<void> {
  const XLSX = await loadXlsx();
  const rows = [...certs].sort((a, b) => a.sessionKey.localeCompare(b.sessionKey) || a.serial - b.serial);

  const aoa: (string | number)[][] = [
    ['Sl. No.', 'Ref. No.', 'Date of Issue', 'Exam Session', 'Name', 'Designation', 'Department',
      'Polytechnic', 'Work', 'Subjects', 'Batches Allotted', 'Students Allotted',
      'Batches Conducted', 'Students Attended', 'Certificate Text'],
    ...rows.map((c, i) => {
      const t = subjectTotals(c.subjects);
      return [
        i + 1,
        c.refNo,
        dmy(c.issueDate),
        `${c.sessionLabel}-${c.sessionYear}`,
        `${c.salutation} ${c.name}`,
        c.designation,
        c.department,
        c.polytechnic,
        WORK_LABELS[c.work],
        c.subjects.map((s) => [s.code, s.name].filter(Boolean).join(' – ')).join('; '),
        t.batchesAllotted,
        t.studentsAllotted,
        t.batchesConducted,
        t.studentsAttended,
        settingCertBodyText(c),
      ];
    }),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [6, 30, 12, 14, 28, 22, 30, 34, 18, 50, 10, 10, 10, 10, 80].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Setting Certificates');
  XLSX.writeFile(wb, `${fileStem}.xlsx`);
}
