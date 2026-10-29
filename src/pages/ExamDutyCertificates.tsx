import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AttendanceCertsView } from '../components/examCerts/AttendanceCertsView';
import { SettingCertsView, type SettingPrefill } from '../components/examCerts/SettingCertsView';
import { CertsHeading, type CertTab } from '../components/examCerts/certUi';

// Exam Duty Certificates: Attendance certificates (half-A4 staff + office copy)
// and Setting & Conducting certificates (A4 staff + office copy). The tab lives
// in the URL (?tab=setting) so a refresh or Back keeps it.

export function ExamDutyCertificates() {
  const [params, setParams] = useSearchParams();
  const tab: CertTab = params.get('tab') === 'setting' ? 'setting' : 'attendance';
  // Examiner handed over from an Attendance certificate; opens the Setting form once.
  const [prefill, setPrefill] = useState<SettingPrefill | null>(null);

  function switchTab(t: CertTab) {
    setPrefill(null);
    setParams(t === 'setting' ? { tab: 'setting' } : {});
  }

  const heading = <CertsHeading tab={tab} onTab={switchTab} />;

  return tab === 'setting' ? (
    <SettingCertsView heading={heading} prefill={prefill} />
  ) : (
    <AttendanceCertsView
      heading={heading}
      onSettingCert={(c) => {
        setPrefill({
          person: {
            salutation: c.salutation,
            name: c.name,
            designation: c.designation,
            department: c.department,
            polytechnic: c.polytechnic,
          },
          session: { label: c.sessionLabel, year: c.sessionYear },
        });
        setParams({ tab: 'setting' });
      }}
    />
  );
}
