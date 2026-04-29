import { useState } from 'react';
import type { Student, Category } from '../../types';

const CATEGORIES: Category[] = ['GM', 'SC', 'ST', 'C1', '2A', '2B', '3A', '3B'];

interface Props {
  student: Student;
  saving: boolean;
  onSave: (allottedCategory: string) => void;
  onSkip: () => void;
}

export function AllottedCategoryModal({ student, saving, onSave, onSkip }: Props) {
  const [value, setValue] = useState(student.allottedCategory ?? student.category);

  const trimmed = value.trim();
  const differsFromClaimed = trimmed !== '' && trimmed !== student.category;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ animation: 'backdrop-enter 0.15s ease-out' }}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onSkip}
        aria-hidden="true"
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        style={{ animation: 'modal-enter 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(90deg, #eff6ff, #f5f3ff)' }}>
          <h3 className="text-sm font-bold text-gray-800">Allotted Category</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
            {student.studentNameSSLC}
            <span className="text-gray-300 mx-1.5">·</span>
            {student.course}
            <span className="text-gray-300 mx-1.5">·</span>
            {student.year}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Claimed category — read-only */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Claimed Category
              <span className="ml-1.5 normal-case font-normal text-gray-300">(from enrollment)</span>
            </p>
            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold border border-gray-200">
              {student.category}
            </span>
          </div>

          {/* Allotted category */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Allotted Category
              <span className="ml-1.5 normal-case font-normal text-gray-300">(by admission committee)</span>
            </p>

            {/* Quick-pick pills */}
            <div className="flex flex-wrap gap-2 mb-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setValue(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    value === cat
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Manual entry */}
            <div className="relative">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                placeholder="e.g. GMR, GMW, SCW…"
                maxLength={10}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-800 uppercase placeholder:normal-case placeholder:font-normal placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {value && (
                <button
                  onClick={() => setValue('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-sm leading-none cursor-pointer"
                  tabIndex={-1}
                >
                  ×
                </button>
              )}
            </div>

            {differsFromClaimed && trimmed && (
              <p className="mt-2 text-[10px] text-amber-600 font-medium">
                Allotted ({trimmed}) differs from claimed ({student.category})
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors cursor-pointer"
          >
            Skip for now
          </button>
          <button
            onClick={() => onSave(trimmed)}
            disabled={saving || trimmed === ''}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
