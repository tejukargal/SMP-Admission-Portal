import type { ExamDutyCertificate } from '../types';
import { loadXlsx } from './lazyLibs';
import { dmy, dutyLabel, dutyPeriodShort, examCertBodyText } from './examDutyCertificate';

/** Issued-certificate register for one exam session (or any selection) as .xlsx. */
export async function exportExamCertsXlsx(certs: ExamDutyCertificate[], fileStem: string): Promise<void> {
  const XLSX = await loadXlsx();
  const rows = [...certs].sort((a, b) => a.sessionKey.localeCompare(b.sessionKey) || a.serial - b.serial);

  const aoa: (string | number)[][] = [
    ['Sl. No.', 'Ref. No.', 'Date of Issue', 'Exam Session', 'Name', 'Designation', 'Department',
      'Polytechnic', 'Duties', 'Period(s)', 'Certificate Text'],
    ...rows.map((c, i) => [
      i + 1,
      c.refNo,
      dmy(c.issueDate),
      `${c.sessionLabel}-${c.sessionYear}`,
      `${c.salutation} ${c.name}`,
      c.designation,
      c.department,
      c.polytechnic,
      c.duties.map(dutyLabel).join('; '),
      c.duties.map((d) => `${dutyLabel(d)}: ${dutyPeriodShort(d)}`).join('; '),
      examCertBodyText(c),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [6, 30, 12, 14, 28, 26, 30, 34, 30, 44, 80].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Certificates');
  XLSX.writeFile(wb, `${fileStem}.xlsx`);
}
