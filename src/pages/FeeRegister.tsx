import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useSettings } from '../hooks/useSettings';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { deleteFeeRecord } from '../services/feeRecordService';
import { FeeEditModal } from '../components/fee/FeeEditModal';
import { FeeHistoryModal } from '../components/fee/FeeHistoryModal';
import { useAuth } from '../contexts/AuthContext';
import type { AcademicYear, Course, Year, FeeRecord, SMPFeeHead, AdmType, AdmCat, PaymentMode } from '../types';
import { SMP_FEE_HEADS, ACADEMIC_YEARS } from '../types';
import { generateSMPReceipt, generateSVKReceipt, generateAdditionalReceipt } from '../utils/feeReceipts';
import { PageSpinner } from '../components/common/PageSpinner';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
const ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];
const PAYMENT_MODES: PaymentMode[] = ['CASH', 'UPI'];
const PAGE_SIZE = 100;

const COURSE_COLORS: Record<Course, { accent: string; badge: string }> = {
  CE: { accent: 'border-l-blue-400',   badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  ME: { accent: 'border-l-orange-400', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  EC: { accent: 'border-l-green-500',  badge: 'bg-green-100 text-green-700 border-green-200' },
  CS: { accent: 'border-l-purple-400', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
  EE: { accent: 'border-l-rose-400',   badge: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const YEAR_LABELS: Record<string, string> = {
  '1ST YEAR': 'Y1',
  '2ND YEAR': 'Y2',
  '3RD YEAR': 'Y3',
};

const fs =
  'rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 cursor-pointer transition-colors';

function calcSMPTotal(record: FeeRecord): number {
  return (SMP_FEE_HEADS as { key: SMPFeeHead }[]).reduce((s, { key }) => s + record.smp[key], 0);
}

function calcSVKTotal(record: FeeRecord): number {
  return record.svk + record.additionalPaid.reduce((s, h) => s + h.amount, 0);
}

function calcTotal(record: FeeRecord): number {
  return calcSMPTotal(record) + calcSVKTotal(record);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseReceiptNum(r: string): number {
  const n = parseInt(r, 10);
  return isNaN(n) ? Infinity : n;
}

function sortRecords(records: FeeRecord[]): FeeRecord[] {
  return [...records].sort((a, b) => {
    // 1. Date ascending (oldest first)
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;

    // 2. CE/ME/EC/CS share one receipt series; EE has its own — keep them grouped
    //    within the same date (non-EE first, EE after)
    const aIsEE = a.course === 'EE' ? 1 : 0;
    const bIsEE = b.course === 'EE' ? 1 : 0;
    if (aIsEE !== bIsEE) return aIsEE - bIsEE;

    // 3. Receipt number ascending (numeric) within the same date + group
    return parseReceiptNum(a.receiptNumber) - parseReceiptNum(b.receiptNumber);
  });
}

function exportRegisterExcel(records: FeeRecord[], additionalHeadLabels: string[], academicYear: string): void {
  const smpHeaders = SMP_FEE_HEADS.map(({ label }) => label);
  const headers = [
    '#', 'Name', 'Father Name', 'Year', 'Course', 'Reg No',
    'Adm Cat', 'Adm Type', 'Date', 'SMP Rpt', 'SVK Rpt', 'Mode', 'Remarks',
    ...smpHeaders, 'SMP Total',
    'SVK', ...additionalHeadLabels, 'SVK Total',
    'Grand Total',
  ];

  const dataRows = records.map((r, idx) => {
    const smpTotal = calcSMPTotal(r);
    const svkTotal = calcSVKTotal(r);
    return [
      idx + 1,
      r.studentName,
      r.fatherName,
      r.year,
      r.course,
      r.regNumber || '',
      r.admCat,
      r.admType,
      formatDate(r.date),
      r.receiptNumber || '',
      r.svkReceiptNumber || '',
      r.paymentMode,
      r.remarks || '',
      ...(SMP_FEE_HEADS as { key: SMPFeeHead }[]).map(({ key }) => r.smp[key] || 0),
      smpTotal,
      r.svk || 0,
      ...additionalHeadLabels.map((label) => r.additionalPaid.find((h) => h.label === label)?.amount ?? 0),
      svkTotal,
      smpTotal + svkTotal,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Register');
  XLSX.writeFile(wb, `Fee_Register_${academicYear}.xlsx`);
}

function LoadingGate() {
  return <PageSpinner />;
}

// ─── Fee Receipt Detail Modal ────────────────────────────────────────────────

const COURSE_GRADIENTS: Record<Course, string> = {
  CE: 'from-blue-600 to-blue-800',
  ME: 'from-orange-500 to-orange-700',
  EC: 'from-green-600 to-green-800',
  CS: 'from-purple-600 to-purple-800',
  EE: 'from-rose-500 to-rose-700',
};

interface FeeReceiptDetailModalProps {
  record: FeeRecord;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFeeDetails: () => void;
}

function FeeReceiptDetailModal({ record, isAdmin, onClose, onEdit, onDelete, onFeeDetails }: FeeReceiptDetailModalProps) {
  const smpTotal = calcSMPTotal(record);
  const svkBase = record.svk;
  const addlTotal = record.additionalPaid.reduce((s, h) => s + h.amount, 0);
  const svkTotal = svkBase + addlTotal;
  const grandTotal = smpTotal + svkTotal;

  const smpHeadsWithValues = (SMP_FEE_HEADS as { key: SMPFeeHead; label: string }[]).filter(({ key }) => record.smp[key] > 0);
  const hasSVK = svkBase > 0 || addlTotal > 0;
  const gradient = COURSE_GRADIENTS[record.course];

  const modeBadge = (mode: string | undefined) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
      mode === 'UPI'
        ? 'bg-violet-50 text-violet-700 border-violet-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
    }`}>
      {mode ?? record.paymentMode}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[440px] flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.25s ease-out', height: '520px' }}
      >
        {/* ── Gradient Header ───────────────────────────────────────────── */}
        <div className={`px-5 py-2.5 bg-gradient-to-r ${gradient} flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 text-[10px] font-bold text-white shrink-0">
                ₹
              </span>
              Fee Receipt
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 shrink-0">
              {record.course} · {YEAR_LABELS[record.year] ?? record.year}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 shrink-0">
              {record.academicYear}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
          >
            ×
          </button>
        </div>

        {/* ── Student Info Bar ──────────────────────────────────────────── */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { label: 'Student', value: record.studentName, bold: true },
              { label: 'Father',  value: record.fatherName },
              { label: 'Reg No',  value: record.regNumber || '—' },
              { label: 'Adm Type', value: record.admType },
              { label: 'Cat',     value: record.admCat },
            ].map(({ label, value, bold }) => (
              <div key={label} className="flex flex-col min-w-0">
                <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{label}</span>
                <span className={`text-xs truncate ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Scrollable Body ───────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>

          {/* Receipt Details */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Receipt Details</span>
            </div>
            <div className="divide-y divide-gray-100 px-3">
              {[
                { label: 'Date',     value: formatDate(record.date),            mono: false },
                { label: 'SMP Rpt', value: record.receiptNumber || '—',         mono: true  },
                { label: 'SVK Rpt', value: record.svkReceiptNumber || '—',      mono: true  },
                ...(record.additionalReceiptNumber
                  ? [{ label: 'Addl Rpt', value: record.additionalReceiptNumber, mono: true }]
                  : []),
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-center py-1.5 text-[11px]">
                  <span className="text-gray-400">{label}</span>
                  <span className={`font-semibold text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-1.5 text-[11px]">
                <span className="text-gray-400">Payment Mode</span>
                <div className="flex items-center gap-1.5">
                  {record.smpPaymentMode && smpTotal > 0 && record.smpPaymentMode !== (record.svkPaymentMode ?? record.paymentMode) ? (
                    <>
                      <span className="text-[9px] text-gray-400">SMP</span>{modeBadge(record.smpPaymentMode)}
                      {hasSVK && <><span className="text-[9px] text-gray-400 ml-1">SVK</span>{modeBadge(record.svkPaymentMode)}</>}
                    </>
                  ) : (
                    modeBadge(record.paymentMode)
                  )}
                </div>
              </div>
              {record.remarks && (
                <div className="flex justify-between items-center py-1.5 text-[11px] gap-3">
                  <span className="text-gray-400 shrink-0">Remarks</span>
                  <span className="font-medium text-gray-600 text-right">{record.remarks}</span>
                </div>
              )}
            </div>
          </div>

          {/* SMP Fee Group */}
          {smpTotal > 0 && (
            <div className="rounded-xl border border-blue-100 overflow-hidden">
              <div className="bg-blue-50 px-3 py-1.5 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center text-[8px] font-black">G</span>
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">SMP Fee — Government</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {record.smpPaymentMode && modeBadge(record.smpPaymentMode)}
                  <button
                    onClick={() => generateSMPReceipt(record)}
                    className="flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100 px-3">
                {smpHeadsWithValues.map(({ key, label }) => (
                  <div key={key} className="flex justify-between items-center py-1.5 text-[11px]">
                    <span className="text-gray-500">{label}</span>
                    <span className="tabular-nums font-medium text-gray-800">₹{record.smp[key].toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50/70 px-3 py-1.5 flex justify-between items-center border-t border-blue-100">
                <span className="text-[11px] font-bold text-blue-700">SMP Total</span>
                <span className="text-xs font-bold text-blue-800 tabular-nums">₹{smpTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* SVK Fee Group */}
          {hasSVK && (
            <div className="rounded-xl border border-violet-100 overflow-hidden">
              {/* SVK sub-section */}
              {svkBase > 0 && (
                <>
                  <div className="bg-violet-50 px-3 py-1.5 border-b border-violet-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-violet-600 text-white flex items-center justify-center text-[8px] font-black">M</span>
                      <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">SVK Fee — Management</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {record.svkPaymentMode && modeBadge(record.svkPaymentMode)}
                      <button
                        onClick={() => generateSVKReceipt(record)}
                        className="flex items-center gap-1 rounded border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-600 hover:bg-violet-50 hover:border-violet-300 transition-colors cursor-pointer"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                    </div>
                  </div>
                  <div className="px-3 border-b border-violet-50">
                    <div className="flex justify-between items-center py-1.5 text-[11px]">
                      <span className="text-gray-500">SVK</span>
                      <span className="tabular-nums font-medium text-gray-800">₹{svkBase.toLocaleString()}</span>
                    </div>
                  </div>
                </>
              )}
              {/* Additional sub-section */}
              {addlTotal > 0 && (
                <>
                  <div className={`bg-emerald-50 px-3 py-1.5 flex items-center justify-between ${svkBase > 0 ? 'border-t border-emerald-100' : ''} border-b border-emerald-100`}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black">+</span>
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Additional Fee</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {record.additionalPaymentMode && modeBadge(record.additionalPaymentMode)}
                      <button
                        onClick={() => generateAdditionalReceipt(record)}
                        className="flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 transition-colors cursor-pointer"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100 px-3">
                    {record.additionalPaid.map((h, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 text-[11px]">
                        <span className="text-gray-500">{h.label}</span>
                        <span className="tabular-nums font-medium text-gray-800">₹{h.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="bg-violet-50/70 px-3 py-1.5 flex justify-between items-center border-t border-violet-100">
                <span className="text-[11px] font-bold text-violet-700">SVK + Additional Total</span>
                <span className="text-xs font-bold text-violet-800 tabular-nums">₹{svkTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Grand Total */}
          <div className={`rounded-xl bg-gradient-to-r ${gradient} px-4 py-3 flex justify-between items-center`}>
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">Grand Total</span>
            <span className="text-lg font-black text-white tabular-nums">₹{grandTotal.toLocaleString()}</span>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-2 bg-gray-50/60 shrink-0">
          {/* Left: admin actions */}
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit
                </button>
              </>
            )}
            <button
              onClick={onFeeDetails}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Fee Details
            </button>
          </div>
          {/* Right: close */}
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeeRegister() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat | ''>('');
  const [paymentModeFilter, setPaymentModeFilter] = useState<PaymentMode | ''>('');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editRecord, setEditRecord] = useState<FeeRecord | null>(null);
  const [historyRecord, setHistoryRecord] = useState<FeeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<FeeRecord | null>(null);

  // Column visibility (hidden by default)
  const [showFatherName, setShowFatherName] = useState(false);
  const [showSMPDetails, setShowSMPDetails] = useState(false);
  const [showSVKDetails, setShowSVKDetails] = useState(false);

  // Filter panel collapse
  const [showFilters, setShowFilters] = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; record: FeeRecord } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    if (!ctxMenu) return;
    function onDown(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) closeCtx();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeCtx(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu, closeCtx]);

  // Default to current academic year once settings load
  useEffect(() => {
    if (settings?.currentAcademicYear && !selectedYear) {
      setSelectedYear(settings.currentAcademicYear);
    }
  }, [settings, selectedYear]);

  // Reset date filter when academic year changes
  useEffect(() => {
    setDateFilter('');
  }, [selectedYear]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const academicYear = selectedYear || null;
  const { records: rawRecords, loading: recordsLoading, refetch } = useFeeRecords(academicYear as AcademicYear | null, { mode: 'by-date' });

  // Sort: oldest date first, then by receipt number
  const sortedRecords = useMemo(() => sortRecords(rawRecords), [rawRecords]);

  // Unique dates for date filter dropdown (descending)
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    for (const r of sortedRecords) if (r.date) dates.add(r.date.slice(0, 10));
    return [...dates].sort((a, b) => b.localeCompare(a));
  }, [sortedRecords]);

  // Collect all unique additional head labels across all records (for dynamic columns)
  const additionalHeadLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const r of sortedRecords) {
      for (const h of r.additionalPaid) {
        if (h.label) labels.add(h.label);
      }
    }
    return [...labels];
  }, [sortedRecords]);

  // Apply filters
  const filteredRecords = useMemo(() => {
    let result = sortedRecords;
    if (courseFilter)       result = result.filter((r) => r.course       === courseFilter);
    if (yearFilter)         result = result.filter((r) => r.year         === yearFilter);
    if (admTypeFilter)      result = result.filter((r) => r.admType      === admTypeFilter);
    if (admCatFilter)       result = result.filter((r) => r.admCat       === admCatFilter);
    if (paymentModeFilter)  result = result.filter((r) => r.paymentMode  === paymentModeFilter);
    if (dateFilter)         result = result.filter((r) => r.date.slice(0, 10) === dateFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.trim().toUpperCase();
      result = result.filter(
        (r) =>
          r.studentName.toUpperCase().includes(q) ||
          r.fatherName.toUpperCase().includes(q) ||
          r.regNumber?.toUpperCase().includes(q) ||
          r.receiptNumber?.includes(q)
      );
    }
    return result;
  }, [sortedRecords, courseFilter, yearFilter, admTypeFilter, admCatFilter, paymentModeFilter, dateFilter, debouncedSearch]);

  // Reset visible window whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredRecords]);

  const visibleRecords = useMemo(
    () => filteredRecords.slice(0, visibleCount),
    [filteredRecords, visibleCount]
  );

  const hasMore = visibleCount < filteredRecords.length;

  const hasActiveFilters = !!searchTerm || !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || !!paymentModeFilter || !!dateFilter;

  function clearFilters() {
    setSearchTerm('');
    setCourseFilter('');
    setYearFilter('');
    setAdmTypeFilter('');
    setAdmCatFilter('');
    setPaymentModeFilter('');
    setDateFilter('');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteFeeRecord(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete record');
    } finally {
      setDeleting(false);
    }
  }

  // Column totals
  const totals = useMemo(() => {
    const smp: Record<SMPFeeHead, number> = {
      adm: 0, tuition: 0, lib: 0, rr: 0, sports: 0, lab: 0,
      dvp: 0, mag: 0, idCard: 0, ass: 0, swf: 0, twf: 0, nss: 0, fine: 0,
    };
    let svk = 0;
    const additional: Record<string, number> = {};
    let grandTotal = 0;

    for (const r of filteredRecords) {
      for (const { key } of SMP_FEE_HEADS) smp[key] += r.smp[key];
      svk += r.svk;
      for (const h of r.additionalPaid) {
        additional[h.label] = (additional[h.label] ?? 0) + h.amount;
      }
      grandTotal += calcTotal(r);
    }
    return { smp, svk, additional, grandTotal };
  }, [filteredRecords]);

  const isLoading = settingsLoading || recordsLoading;

  if (isLoading) return <LoadingGate />;

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-tight tracking-tight">Fee Register</h2>
          {selectedYear && (
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{selectedYear}</p>
          )}
        </div>

        {!isLoading && sortedRecords.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              <span className="text-gray-500 font-medium">Records</span>
              <span className="font-bold tabular-nums text-gray-900">
                {filteredRecords.length}
                {hasActiveFilters && filteredRecords.length !== sortedRecords.length && (
                  <span className="text-gray-400 font-normal"> / {sortedRecords.length}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              <span className="text-emerald-700 font-medium">Collected</span>
              <span className="font-bold tabular-nums text-emerald-900">₹{totals.grandTotal.toLocaleString()}</span>
            </div>
            <button
              onClick={() => exportRegisterExcel(filteredRecords, additionalHeadLabels, selectedYear)}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shadow-sm"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
              </svg>
              Export Excel
            </button>
          </div>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Filter bar header — always visible */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer transition-colors select-none"
          >
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showFilters ? 'rotate-0' : '-rotate-90'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filters &amp; Columns
          </button>
          {hasActiveFilters && (
            <span className="rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 border border-orange-200">
              {[searchTerm, courseFilter, yearFilter, admTypeFilter, admCatFilter, paymentModeFilter, dateFilter].filter(Boolean).length} active
            </span>
          )}
          {(showFatherName || showSMPDetails || showSVKDetails) && (
            <span className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 border border-blue-200">
              {[showFatherName, showSMPDetails, showSVKDetails].filter(Boolean).length} col{[showFatherName, showSMPDetails, showSVKDetails].filter(Boolean).length > 1 ? 's' : ''} shown
            </span>
          )}
          {hasActiveFilters && !showFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto rounded-full border border-orange-300 px-2.5 py-0.5 text-[10px] text-orange-700 bg-orange-50 hover:bg-orange-100 cursor-pointer transition-colors font-medium"
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Collapsible body */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <select
              className={fs}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value as AcademicYear | '')}
            >
              <option value="">Select Year</option>
              {[...ACADEMIC_YEARS].reverse().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <span className="text-gray-200 text-sm select-none">|</span>

            <input
              type="text"
              placeholder="Search name / reg / rpt…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-44 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 bg-white text-gray-700 placeholder:text-gray-400"
            />
            <select className={fs} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value as Course | '')}>
              <option value="">All Courses</option>
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={fs} value={yearFilter} onChange={(e) => setYearFilter(e.target.value as Year | '')}>
              <option value="">All Years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className={fs} value={admTypeFilter} onChange={(e) => setAdmTypeFilter(e.target.value as AdmType | '')}>
              <option value="">All Adm Types</option>
              {ADM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={fs} value={admCatFilter} onChange={(e) => setAdmCatFilter(e.target.value as AdmCat | '')}>
              <option value="">All Adm Cats</option>
              {ADM_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={fs} value={paymentModeFilter} onChange={(e) => setPaymentModeFilter(e.target.value as PaymentMode | '')}>
              <option value="">All Modes</option>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className={fs} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="">All Dates</option>
              {uniqueDates.map((d) => (
                <option key={d} value={d}>{formatDate(d)}</option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="rounded-full border border-orange-300 px-3 py-1.5 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-400 focus:outline-none cursor-pointer transition-colors font-medium"
              >
                ✕ Clear
              </button>
            )}

            <span className="text-gray-200 text-sm select-none">|</span>

            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide select-none">Cols:</span>
            {(
              [
                { label: 'Father Name', active: showFatherName, toggle: () => setShowFatherName((v) => !v) },
                { label: 'Fee Breakdown', active: showSMPDetails, toggle: () => setShowSMPDetails((v) => !v) },
                { label: 'SVK Details', active: showSVKDetails, toggle: () => setShowSVKDetails((v) => !v) },
              ] as { label: string; active: boolean; toggle: () => void }[]
            ).map(({ label, active, toggle }) => (
              <button
                key={label}
                onClick={toggle}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Table / empty states ─────────────────────────────────────────── */}
      {!selectedYear ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
          <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 4h10M3 11h18M3 15h10m-7 4h4" />
          </svg>
          <span className="text-sm">Select an academic year to view the fee register.</span>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
          <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">
            {sortedRecords.length === 0
              ? 'No fee records found for this academic year.'
              : 'No records match the current filters.'}
          </span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto flex flex-col">
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              {/* Group header */}
              <tr className="border-b border-gray-200">
                <th
                  colSpan={showFatherName ? 13 : 12}
                  className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-gray-200 bg-slate-50"
                >
                  Student Info
                </th>
                <th
                  colSpan={showSMPDetails ? SMP_FEE_HEADS.length + 1 : 1}
                  className="px-3 py-1.5 text-center text-[10px] font-bold text-blue-600 uppercase tracking-wider border-r border-gray-200 bg-blue-50"
                >
                  SMP Fee — Government
                </th>
                <th
                  colSpan={showSVKDetails ? 1 + additionalHeadLabels.length + 1 : 1}
                  className="px-3 py-1.5 text-center text-[10px] font-bold text-violet-600 uppercase tracking-wider border-r border-gray-200 bg-violet-50"
                >
                  SVK Fee — Management
                </th>
                <th className="px-3 py-1.5 text-center text-[10px] font-bold text-emerald-700 uppercase tracking-wider border-r border-gray-200 bg-emerald-50">
                  Grand Total
                </th>
                {isAdmin && (
                  <th className="px-3 py-1.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-slate-50">
                    Actions
                  </th>
                )}
              </tr>

              {/* Column header */}
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2 text-left font-semibold text-slate-500 whitespace-nowrap w-8 sticky left-0 z-20 bg-slate-100 text-[10px] uppercase tracking-wide">#</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap sticky left-8 z-20 bg-slate-100 border-r border-slate-200 text-[10px] uppercase tracking-wide">Name</th>
                {showFatherName && <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap bg-slate-100 text-[10px] uppercase tracking-wide">Father Name</th>}
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-16 bg-slate-100 text-[10px] uppercase tracking-wide">Year</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-12 bg-slate-100 text-[10px] uppercase tracking-wide">Course</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-24 bg-slate-100 text-[10px] uppercase tracking-wide">Reg No</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-14 bg-slate-100 text-[10px] uppercase tracking-wide">Cat</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-20 bg-slate-100 text-[10px] uppercase tracking-wide">Adm Type</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-20 bg-slate-100 text-[10px] uppercase tracking-wide">Date</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-12 bg-slate-100 text-[10px] uppercase tracking-wide">SMP Rpt</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-24 bg-slate-100 text-[10px] uppercase tracking-wide">SVK Rpt</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-14 bg-slate-100 text-[10px] uppercase tracking-wide">Mode</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-700 whitespace-nowrap w-28 bg-slate-100 border-r border-slate-200 text-[10px] uppercase tracking-wide">Remarks</th>

                {showSMPDetails && SMP_FEE_HEADS.map(({ key, label }) => (
                  <th key={key} className="px-2 py-2 text-right font-semibold text-blue-700 whitespace-nowrap w-14 bg-blue-100 text-[10px] uppercase tracking-wide">
                    {label}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-bold text-blue-800 whitespace-nowrap w-16 bg-blue-100 border-r border-blue-200 text-[10px] uppercase tracking-wide">
                  SMP Total
                </th>

                {showSVKDetails && (
                  <th className="px-2 py-2 text-right font-semibold text-violet-700 whitespace-nowrap w-14 bg-violet-100 text-[10px] uppercase tracking-wide">SVK</th>
                )}
                {showSVKDetails && additionalHeadLabels.map((label) => (
                  <th key={label} className="px-2 py-2 text-right font-semibold text-violet-700 whitespace-nowrap w-20 bg-violet-100 text-[10px] uppercase tracking-wide">{label}</th>
                ))}
                <th className="px-2 py-2 text-right font-bold text-violet-800 whitespace-nowrap w-16 bg-violet-100 border-r border-violet-200 text-[10px] uppercase tracking-wide">
                  SVK Total
                </th>

                <th className="px-2 py-2 text-right font-bold text-emerald-800 whitespace-nowrap w-20 bg-emerald-100 border-r border-emerald-200 text-[10px] uppercase tracking-wide">
                  Total
                </th>
                {isAdmin && (
                  <th className="px-2 py-2 text-center font-semibold text-slate-600 whitespace-nowrap w-20 bg-slate-100 text-[10px] uppercase tracking-wide">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {visibleRecords.map((record, idx) => {
                const smpTotal = calcSMPTotal(record);
                const svkTotal = calcSVKTotal(record);
                const total = smpTotal + svkTotal;
                const cc = COURSE_COLORS[record.course];
                return (
                  <tr
                    key={record.id}
                    className={`group hover:bg-slate-50/70 transition-colors cursor-context-menu border-l-2 ${cc.accent}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, record });
                    }}
                  >
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap sticky left-0 z-[1] bg-white group-hover:bg-slate-50/70 transition-colors">{idx + 1}</td>
                    <td
                      className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap sticky left-8 z-[1] bg-white group-hover:bg-slate-50/70 transition-colors border-r border-gray-100 cursor-pointer select-none"
                      onDoubleClick={() => setDetailRecord(record)}
                      title="Double-click to view fee details"
                    >
                      {record.studentName}
                      {record.academicYear !== selectedYear && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 align-middle">
                          PY {record.academicYear}
                        </span>
                      )}
                    </td>
                    {showFatherName && <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{record.fatherName}</td>}
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="text-[10px] font-semibold text-gray-500">
                        {YEAR_LABELS[record.year] ?? record.year}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${cc.badge}`}>
                        {record.course}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap font-mono">{record.regNumber || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{record.admCat}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{record.admType}</td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{formatDate(record.date)}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono text-[11px]">{record.receiptNumber || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono text-[11px]">{record.svkReceiptNumber || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          record.paymentMode === 'UPI'
                            ? 'bg-violet-100 text-violet-700 border-violet-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {record.paymentMode}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap border-r border-gray-100 max-w-[7rem] truncate" title={record.remarks}>
                      {record.remarks || <span className="text-gray-200">—</span>}
                    </td>

                    {/* SMP heads */}
                    {showSMPDetails && SMP_FEE_HEADS.map(({ key }) => (
                      <td key={key} className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap tabular-nums bg-blue-50/30">
                        {record.smp[key] > 0 ? record.smp[key].toLocaleString() : <span className="text-gray-200">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold text-blue-800 whitespace-nowrap tabular-nums border-r border-gray-100 bg-blue-50/50">
                      {smpTotal.toLocaleString()}
                    </td>

                    {/* SVK */}
                    {showSVKDetails && (
                      <td className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap tabular-nums bg-violet-50/30">
                        {record.svk > 0 ? record.svk.toLocaleString() : <span className="text-gray-200">—</span>}
                      </td>
                    )}
                    {showSVKDetails && additionalHeadLabels.map((label) => {
                      const val = record.additionalPaid.find((h) => h.label === label)?.amount ?? 0;
                      return (
                        <td key={label} className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap tabular-nums bg-violet-50/30">
                          {val > 0 ? val.toLocaleString() : <span className="text-gray-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-bold text-violet-800 whitespace-nowrap tabular-nums border-r border-gray-100 bg-violet-50/50">
                      {svkTotal.toLocaleString()}
                    </td>

                    {/* Grand total */}
                    <td className="px-2 py-1.5 text-right font-bold text-emerald-700 whitespace-nowrap tabular-nums border-r border-gray-100 bg-emerald-50/50">
                      ₹{total.toLocaleString()}
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditRecord(record)}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 hover:border-blue-300 transition-colors cursor-pointer"
                            title="Edit record"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(record); setDeleteError(null); }}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-colors cursor-pointer"
                            title="Delete record"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {hasMore && (
                <tr>
                  <td
                    colSpan={
                      (showFatherName ? 13 : 12) +
                      (showSMPDetails ? SMP_FEE_HEADS.length : 0) + 1 +
                      (showSVKDetails ? 1 + additionalHeadLabels.length : 0) + 1 +
                      1 + (isAdmin ? 1 : 0)
                    }
                    className="px-4 py-3 text-center"
                  >
                    <button
                      className="rounded-full border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 px-4 py-1 text-xs font-medium transition-colors cursor-pointer"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load {Math.min(PAGE_SIZE, filteredRecords.length - visibleCount)} more ({filteredRecords.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals footer */}
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-slate-700 border-t-2 border-slate-600 font-semibold text-white">
                <td className="px-2 py-2 text-slate-300 text-[10px] uppercase tracking-wide sticky left-0 z-20 bg-slate-700" colSpan={2}>
                  Totals · {filteredRecords.length} records
                </td>
                <td colSpan={showFatherName ? 11 : 10} className="bg-slate-700 border-r border-slate-600" />

                {showSMPDetails && SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-2 py-2 text-right text-blue-200 whitespace-nowrap tabular-nums text-xs">
                    {totals.smp[key] > 0 ? totals.smp[key].toLocaleString() : <span className="text-slate-500">—</span>}
                  </td>
                ))}
                <td className="px-2 py-2 text-right text-blue-100 whitespace-nowrap tabular-nums font-bold border-r border-slate-600">
                  {(Object.values(totals.smp) as number[]).reduce((s, v) => s + v, 0).toLocaleString()}
                </td>

                {showSVKDetails && (
                  <td className="px-2 py-2 text-right text-violet-200 whitespace-nowrap tabular-nums">
                    {totals.svk > 0 ? totals.svk.toLocaleString() : <span className="text-slate-500">—</span>}
                  </td>
                )}
                {showSVKDetails && additionalHeadLabels.map((label) => (
                  <td key={label} className="px-2 py-2 text-right text-violet-200 whitespace-nowrap tabular-nums">
                    {(totals.additional[label] ?? 0) > 0
                      ? (totals.additional[label] ?? 0).toLocaleString()
                      : <span className="text-slate-500">—</span>}
                  </td>
                ))}
                <td className="px-2 py-2 text-right text-violet-100 whitespace-nowrap tabular-nums font-bold border-r border-slate-600">
                  {(totals.svk + additionalHeadLabels.reduce((s, l) => s + (totals.additional[l] ?? 0), 0)).toLocaleString()}
                </td>

                <td className="px-2 py-2 text-right text-emerald-300 whitespace-nowrap tabular-nums font-bold text-sm border-r border-slate-600">
                  ₹{totals.grandTotal.toLocaleString()}
                </td>
                {isAdmin && <td className="bg-slate-700" />}
              </tr>
            </tfoot>
          </table>

          <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 mt-auto shrink-0 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-gray-300 inline-block" />
            Showing {Math.min(visibleCount, filteredRecords.length)} of {filteredRecords.length}
            {filteredRecords.length < sortedRecords.length && (
              <span className="text-gray-300"> (filtered from {sortedRecords.length} total)</span>
            )}
          </div>
        </div>
      )}

      {/* Fee receipt detail modal (double-click on name) */}
      {detailRecord && (
        <FeeReceiptDetailModal
          record={detailRecord}
          isAdmin={isAdmin}
          onClose={() => setDetailRecord(null)}
          onEdit={() => { setEditRecord(detailRecord); setDetailRecord(null); }}
          onDelete={() => { setDeleteTarget(detailRecord); setDeleteError(null); setDetailRecord(null); }}
          onFeeDetails={() => { setHistoryRecord(detailRecord); setDetailRecord(null); }}
        />
      )}

      {/* Edit modal */}
      {editRecord && (
        <FeeEditModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { refetch(); setEditRecord(null); }}
        />
      )}

      {/* Fee history modal */}
      {historyRecord && (
        <FeeHistoryModal
          student={{
            id: historyRecord.studentId,
            regNumber: historyRecord.regNumber,
            studentNameSSLC: historyRecord.studentName,
            fatherName: historyRecord.fatherName,
            course: historyRecord.course,
            year: historyRecord.year,
            admType: historyRecord.admType,
            admCat: historyRecord.admCat,
          }}
          onClose={() => setHistoryRecord(null)}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (() => {
        const smp = calcSMPTotal(ctxMenu.record);
        const svk = ctxMenu.record.svk;
        const addl = ctxMenu.record.additionalPaid.reduce((s, h) => s + h.amount, 0);
        return (
          <div
            ref={ctxRef}
            className="fixed z-50 bg-white border border-gray-200/80 rounded-2xl overflow-hidden min-w-[210px]"
            style={{ top: ctxMenu.y, left: ctxMenu.x, boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          >
            {/* Header */}
            <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {ctxMenu.record.studentName.charAt(0)}
              </span>
              <span className="text-[12px] font-semibold text-gray-800 truncate">{ctxMenu.record.studentName}</span>
            </div>
            {/* Items */}
            <div className="py-1.5">
              <button
                disabled={smp === 0}
                className="group w-full text-left px-3 py-[7px] text-[13px] flex items-center gap-2.5 transition-colors duration-100 disabled:opacity-30 disabled:cursor-not-allowed enabled:text-gray-600 enabled:hover:bg-blue-50/70 enabled:hover:text-blue-800 enabled:cursor-pointer"
                onClick={() => { generateSMPReceipt(ctxMenu.record); closeCtx(); }}
              >
                <span className="w-[18px] h-[18px] rounded-[5px] bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0 group-enabled:group-hover:bg-blue-200 transition-colors">SMP</span>
                SMP Receipt
              </button>
              <button
                disabled={svk === 0}
                className="group w-full text-left px-3 py-[7px] text-[13px] flex items-center gap-2.5 transition-colors duration-100 disabled:opacity-30 disabled:cursor-not-allowed enabled:text-gray-600 enabled:hover:bg-violet-50/70 enabled:hover:text-violet-800 enabled:cursor-pointer"
                onClick={() => { generateSVKReceipt(ctxMenu.record); closeCtx(); }}
              >
                <span className="w-[18px] h-[18px] rounded-[5px] bg-violet-100 text-violet-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0 group-enabled:group-hover:bg-violet-200 transition-colors">SVK</span>
                SVK Receipt
              </button>
              <button
                disabled={addl === 0}
                className="group w-full text-left px-3 py-[7px] text-[13px] flex items-center gap-2.5 transition-colors duration-100 disabled:opacity-30 disabled:cursor-not-allowed enabled:text-gray-600 enabled:hover:bg-emerald-50/70 enabled:hover:text-emerald-800 enabled:cursor-pointer"
                onClick={() => { generateAdditionalReceipt(ctxMenu.record); closeCtx(); }}
              >
                <span className="w-[18px] h-[18px] rounded-[5px] bg-emerald-100 text-emerald-600 flex items-center justify-center text-[11px] font-bold flex-shrink-0 group-enabled:group-hover:bg-emerald-200 transition-colors">+</span>
                Additional Receipt
              </button>
              <div className="my-1 h-px bg-gray-100 mx-3" />
              <button
                className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 cursor-pointer transition-colors duration-100"
                onClick={() => { setHistoryRecord(ctxMenu.record); closeCtx(); }}
              >
                <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 group-hover:text-gray-700 transition-colors">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </span>
                Fee Details
              </button>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => { if (!deleting) setDeleteTarget(null); }}
            aria-hidden="true"
            style={{ animation: 'backdrop-enter 0.2s ease-out' }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="bg-red-50 border-b border-red-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-900">Delete Fee Record?</h3>
                  <p className="text-xs text-red-600 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-600 mb-1">
                <span className="font-semibold text-gray-800">{deleteTarget.studentName}</span>
                <span className="text-gray-400"> · {formatDate(deleteTarget.date)}</span>
                {deleteTarget.receiptNumber && (
                  <span className="ml-1 text-gray-400">· Rpt {deleteTarget.receiptNumber}</span>
                )}
              </p>
              {deleteError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                  {deleteError}
                </p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="rounded-full border border-transparent px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
