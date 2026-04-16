import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  uppercase?: boolean;
}

export function Input({
  label,
  error,
  uppercase = false,
  className = '',
  onChange,
  style,
  ...props
}: InputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (uppercase) {
      e.target.value = e.target.value.toUpperCase();
    }
    onChange?.(e);
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{label}</label>
      )}
      <input
        className={`block w-full rounded-lg border px-3 py-2 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-200'
        } ${className}`}
        style={uppercase ? { textTransform: 'uppercase', ...style } : style}
        onChange={handleChange}
        {...props}
      />
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}
