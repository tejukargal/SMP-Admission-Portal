import { useState } from 'react';
import type { Student, Category } from '../../types';
import { Input } from './Input';
import { Select } from './Select';
import { updateStudentFields, getOtherYearRecords } from '../../services/studentService';
import { saveTcEditRecord } from '../../services/tcService';

const PASSKEY = 'annismp';

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

interface EditableFields {
  fatherName: string;
  motherName: string;
  dateOfBirth: string;
  caste: string;
  category: Category;
}

interface Props {
  student: Student;
  onClose: () => void;
  onSaved: (updated: EditableFields) => void;
}

export function ExtraDetailsEditModal({ student, onClose, onSaved }: Props) {
  const [unlocked,  setUnlocked]  = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState(false);

  const [fatherName,  setFatherName]  = useState(student.fatherName);
  const [motherName,  setMotherName]  = useState(student.motherName);
  const [dateOfBirth, setDateOfBirth] = useState(student.dateOfBirth);
  const [caste,       setCaste]       = useState(student.caste);
  const [category,    setCategory]    = useState<Category>(student.category);

  function normalizeDOB(val: string): string {
    const parts = val.trim().split('/');
    if (parts.length !== 3) return val;
    const [rawD, rawM, rawY] = parts;
    if (!rawD || !rawM || !rawY) return val;
    const dd = rawD.padStart(2, '0');
    const mm = rawM.padStart(2, '0');
    const twoDigit = rawY.padStart(2, '0');
    const yyyy = rawY.length <= 2
      ? (parseInt(twoDigit, 10) >= 80 ? '19' : '20') + twoDigit
      : rawY;
    return `${dd}/${mm}/${yyyy}`;
  }

  function handleDOBChange(e: React.ChangeEvent<HTMLInputElement>) {
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
    setDateOfBirth(val);
  }

  const [saving,  setSaving]  = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  function handlePasskeySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passInput === PASSKEY) {
      setUnlocked(true);
    } else {
      setPassError(true);
      setPassInput('');
    }
  }

  async function handleSave() {
    if (saving) return;
    setErrorMsg('');

    const next: EditableFields = { fatherName, motherName, dateOfBirth, caste, category };
    const fieldLabels: Record<keyof EditableFields, string> = {
      fatherName: "Father's Name",
      motherName: "Mother's Name",
      dateOfBirth: 'Date of Birth',
      caste: 'Caste',
      category: 'Category',
    };

    const changedFields: Partial<EditableFields> = {};
    const changeNotes: { label: string; from: string; to: string }[] = [];
    (Object.keys(next) as (keyof EditableFields)[]).forEach((key) => {
      const from = student[key];
      const to = next[key];
      if (from !== to) {
        (changedFields as Record<string, unknown>)[key] = to;
        changeNotes.push({ label: fieldLabels[key], from: from || '—', to: to || '—' });
      }
    });

    if (Object.keys(changedFields).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await updateStudentFields(student.id, changedFields);

      const siblings = await getOtherYearRecords(student);
      if (siblings.length > 0) {
        await Promise.all(siblings.map((s) => updateStudentFields(s.id, changedFields)));
      }

      await saveTcEditRecord(student.id, changeNotes).catch(() => {});

      onSaved(next);
    } catch {
      setErrorMsg('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ animation: 'backdrop-enter 0.15s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4"
        style={{ animation: 'modal-enter 0.2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Edit Extra Details</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[240px]">{student.studentNameSSLC}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        {!unlocked ? (
          <form onSubmit={handlePasskeySubmit} className="px-5 py-5 flex flex-col gap-3">
            <p className="text-xs text-gray-400">Enter the passkey to edit these details.</p>
            <input
              type="password"
              autoFocus
              placeholder="Passkey"
              value={passInput}
              onChange={(e) => { setPassInput(e.target.value); setPassError(false); }}
              className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                passError
                  ? 'border-red-400 focus:ring-red-400 bg-red-50'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
            {passError && <p className="text-xs text-red-500 -mt-1">Incorrect passkey. Try again.</p>}
            <div className="flex justify-end gap-2 mt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer">
                Unlock
              </button>
            </div>
          </form>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <Input label="Father's Name" uppercase value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
            <Input label="Mother's Name" uppercase value={motherName} onChange={(e) => setMotherName(e.target.value)} />
            <Input
              label="Date of Birth"
              value={dateOfBirth}
              onChange={handleDOBChange}
              onBlur={() => { if (dateOfBirth) setDateOfBirth(normalizeDOB(dateOfBirth)); }}
              placeholder="DD/MM/YYYY"
              maxLength={10}
            />
            <Input label="Caste" uppercase value={caste} onChange={(e) => setCaste(e.target.value)} />
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              options={CATEGORY_OPTIONS}
            />

            {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

            <p className="text-[11px] text-gray-400">
              Changes apply to this student's record and all of their other enrollment years, with a note saved to the TC history.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" disabled={saving}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
