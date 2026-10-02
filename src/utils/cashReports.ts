// Cash & Bank report catalogue — kept free of jsPDF/xlsx so the Cash Book page can
// list the reports without loading the export libraries.
export type CashReportKind = 'remittance-summary' | 'cash-book' | 'deposit-register' | 'receipt-detail' | 'upi-statement';

export const CASH_REPORTS: { kind: CashReportKind; title: string; blurb: string }[] = [
  { kind: 'remittance-summary', title: 'Fee Remittance Summary', blurb: 'Overall picture per collection day and account: cash collected → deposited (date/challan), UPI collected → credited (date/UTR), and anything still unremitted.' },
  { kind: 'cash-book',        title: 'Cash Book',               blurb: 'Date-wise opening cash, cash received, deposited to bank and closing cash in hand — per account and combined.' },
  { kind: 'deposit-register', title: 'Deposit Register',        blurb: 'Every bank deposit with challan/UTR reference, the collection days and receipt range it covers.' },
  { kind: 'receipt-detail',   title: 'Receipt-wise Detail',     blurb: 'Every receipt with its cash and UPI amounts, collection date and the deposit that cleared it (or PENDING).' },
  { kind: 'upi-statement',    title: 'UPI Credit Statement',    blurb: 'UPI collected per day and account with the date it was credited to the bank and UTR — tick against the bank statement.' },
];
