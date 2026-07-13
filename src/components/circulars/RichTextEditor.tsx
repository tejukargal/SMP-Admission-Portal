import { useEffect, useRef } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const TOOLS: { cmd: string; label: string; title: string; className?: string }[] = [
  { cmd: 'bold', label: 'B', title: 'Bold', className: 'font-black' },
  { cmd: 'italic', label: 'I', title: 'Italic', className: 'italic font-serif' },
  { cmd: 'underline', label: 'U', title: 'Underline', className: 'underline' },
];

/** Minimal rich text editor (contentEditable + execCommand), ported from SMP
 *  Connect's CircularForm. Initial HTML is seeded once via a ref so the caret
 *  is never reset by re-renders; output HTML is sanitized on render, not here. */
export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !editorRef.current) return;
    seededRef.current = true;
    editorRef.current.innerHTML = value;
  }, [value]);

  function exec(cmd: string) {
    editorRef.current?.focus();
    document.execCommand(cmd);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-400 focus-within:border-emerald-400 transition-colors">
      <div className="flex items-center gap-0.5 border-b border-gray-100 bg-gray-50 px-1.5 py-1">
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            title={t.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(t.cmd)}
            className={`w-7 h-7 rounded text-xs text-gray-600 hover:bg-gray-200 cursor-pointer ${t.className ?? ''}`}
          >
            {t.label}
          </button>
        ))}
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <button type="button" title="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} className="w-7 h-7 rounded text-gray-600 hover:bg-gray-200 cursor-pointer flex items-center justify-center">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
        </button>
        <button type="button" title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')} className="w-7 h-7 rounded text-gray-600 hover:bg-gray-200 cursor-pointer flex items-center justify-center">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
        </button>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <button type="button" title="Align left" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')} className="w-7 h-7 rounded text-gray-600 hover:bg-gray-200 cursor-pointer flex items-center justify-center">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
        </button>
        <button type="button" title="Align center" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')} className="w-7 h-7 rounded text-gray-600 hover:bg-gray-200 cursor-pointer flex items-center justify-center">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>
        <button type="button" title="Align right" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')} className="w-7 h-7 rounded text-gray-600 hover:bg-gray-200 cursor-pointer flex items-center justify-center">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="min-h-[140px] max-h-[320px] overflow-y-auto px-3 py-2 text-sm text-gray-800 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
      />
    </div>
  );
}
