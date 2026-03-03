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
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <input
        className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${className}`}
        style={uppercase ? { textTransform: 'uppercase', ...style } : style}
        onChange={handleChange}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
