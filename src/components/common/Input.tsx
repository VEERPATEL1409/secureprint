import React, { InputHTMLAttributes, useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  labelRight?: React.ReactNode;
  variant?: 'light' | 'dark';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  labelRight,
  id,
  type,
  variant = 'light',
  className = '',
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  const isDark = variant === 'dark';

  return (
    <div className="w-full space-y-1.5">
      {(label || labelRight) && (
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={inputId} className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {label}
            </label>
          )}
          {labelRight}
        </div>
      )}
      <div className="relative">
        <input
          id={inputId}
          ref={ref}
          type={effectiveType}
          className={`w-full rounded-lg border px-3.5 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 ${
            isPassword ? 'pr-10' : ''
          } ${
            isDark
              ? error
                ? 'border-rose-500 bg-slate-800 text-white placeholder-slate-500 focus:border-rose-500 focus:ring-rose-400/20'
                : 'border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-indigo-400/20'
              : error
                ? 'border-rose-300 bg-white text-slate-900 placeholder-slate-400 focus:border-rose-500 focus:ring-rose-200'
                : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:ring-emerald-100'
          } ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 transition-colors rounded-md focus:outline-none ${
              isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
      {helperText && !error && <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  return <Input ref={ref} type="password" {...props} />;
});

PasswordInput.displayName = 'PasswordInput';
