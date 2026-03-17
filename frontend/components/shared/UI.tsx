/**
 * Shared UI Components
 * 
 * "Professional Vanilla" Design System
 * Focus: High density, clean lines, predictable behavior.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, X, AlertCircle, Info, ExternalLink, Search, ChevronDown } from 'lucide-react';

export const ConfidenceBadge: React.FC<{ value: number }> = ({ value }) => {
// ... existing ConfidenceBadge code ...
  const color = value > 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                value > 50 ? 'bg-amber-50 text-amber-700 border-amber-100' :
                'bg-rose-50 text-rose-700 border-rose-100';
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${color}`}
      data-testid="confidence-badge"
    >
      {value}%
    </span>
  );
};

export const DataCompletenessBar: React.FC<{ filled: number, total: number }> = ({ filled, total }) => {
  const percentage = Math.round((filled / total) * 100);
  const color = percentage === 100 ? 'bg-emerald-500' : 
                percentage > 50 ? 'bg-blue-500' : 'bg-amber-500';

  return (
    <div className="w-full flex items-center gap-2" data-testid="completeness-bar-container">
      <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-gray-400 tabular-nums w-8 text-right">{percentage}%</span>
    </div>
  );
};

export const StatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const normalized = status.toLowerCase();
  const config: Record<string, { color: string; label: string }> = {
    'missing_images': { color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Missing Images' },
    'ready_for_ai': { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Ready for AI' },
    'ai_review': { color: 'bg-pink-50 text-pink-700 border-pink-200', label: 'AI Review' },
    'accepted': { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ready to Sync' },
    'approved': { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ready to Sync' },
    'sync_ready': { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ready to Sync' },
    'ready_to_sync': { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ready to Sync' },
    'synced': { color: 'bg-gray-50 text-gray-600 border-gray-200', label: 'Synced' },
    // Job statuses
    'queued': { color: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Queued' },
    'running': { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Running' },
    'done': { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Done' },
    'retry': { color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Retrying' },
    'dead': { color: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Failed' },
    // Shopify statuses
    'live': { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Live' },
    'draft': { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Draft' },
    'error': { color: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Error' },
    'not_published': { color: 'bg-gray-50 text-gray-500 border-gray-200', label: 'Unpublished' }
  };

  const item = config[normalized] || { color: 'bg-gray-50 text-gray-500 border-gray-200', label: status };

  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${item.color}`}>
      {label || item.label}
    </span>
  );
};

export const Card: React.FC<{ 
  title?: string; 
  subtitle?: string; 
  children: React.ReactNode; 
  className?: string;
  footer?: React.ReactNode;
}> = ({ title, subtitle, children, className = '', footer }) => {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col ${className}`}>
      {(title || subtitle) && (
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="p-5 flex-1">{children}</div>
      {footer && <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 rounded-b-lg">{footer}</div>}
    </div>
  );
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger',
  size?: 'xs' | 'sm' | 'md' | 'lg',
  isLoading?: boolean,
  icon?: React.ReactNode,
  fullWidth?: boolean
}> = ({ 
  children, variant = 'primary', size = 'md', className = '', isLoading, icon, fullWidth, ...props 
}) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded font-semibold transition-all active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed';
  
  const sizes = {
    xs: 'px-2 py-1 text-[10px]',
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const variants = {
    primary: 'bg-purple-600 text-white hover:bg-purple-700',
    secondary: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
    outline: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:bg-gray-100',
    danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200',
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`} {...props}>
      {isLoading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon}
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string, error?: string }> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">{label}</label>}
      <input 
        className={`px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none ${error ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-white hover:border-gray-300'} ${className}`}
        {...props}
      />
      {error && <span className="text-[10px] font-bold text-rose-600">{error}</span>}
    </div>
  );
};

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { 
  label?: string, 
  error?: string,
  placeholder?: string,
  options: Array<{ value: string | number; label: string }>
}> = ({ label, error, options, className = '', placeholder, ...props }) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">{label}</label>}
      <select 
        className={`px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none bg-no-repeat bg-[right_0.5rem_center] bg-[length:1.5em_1.5em] ${error ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-white hover:border-gray-300'} ${className}`}
        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <span className="text-[10px] font-bold text-rose-600">{error}</span>}
    </div>
  );
};

export interface SearchableSelectOption {
  id: string;
  name: string;
}

export const SearchableSelect: React.FC<{
  label?: string;
  value: string | string[];
  options: SearchableSelectOption[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  multi?: boolean;
}> = ({ label, value, options, onChange, placeholder = "Search...", emptyLabel = "No results found", disabled, className = "", multi = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOptions = useMemo(() => {
    if (multi && Array.isArray(value)) {
      return options.filter(o => value.includes(o.id));
    }
    const found = options.find(o => o.id === value);
    return found ? [found] : [];
  }, [options, value, multi]);

  const filteredOptions = useMemo(() => {
    let list = options;
    if (search) {
      const lowerSearch = search.toLowerCase();
      list = options.filter(o => 
        o.id.toLowerCase().includes(lowerSearch) || 
        o.name.toLowerCase().includes(lowerSearch)
      );
    }
    
    // Deduplicate by ID to prevent React key warnings from legacy/messy data
    const seen = new Set();
    return list.filter(o => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    if (multi) {
      const currentValues = Array.isArray(value) ? value : [];
      if (id === "") {
        onChange([]); // Clear all if "All Items" selected
      } else {
        const nextValues = currentValues.includes(id)
          ? currentValues.filter(v => v !== id)
          : [...currentValues, id];
        onChange(nextValues);
      }
    } else {
      onChange(id);
      setIsOpen(false);
    }
  };

  const isSelected = (id: string) => {
    if (multi && Array.isArray(value)) return value.includes(id);
    return value === id;
  };

  const hasSelection = multi ? (Array.isArray(value) && value.length > 0) : !!value;

  return (
    <div className={`flex flex-col gap-1.5 relative ${className}`} ref={containerRef}>
      {label && <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</label>}
      
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-1.5 border rounded-md text-sm flex items-center justify-between transition-all outline-none shadow-sm ${
          disabled ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' : 
          'bg-white border-gray-200 hover:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500'
        }`}
      >
        <span className="truncate flex-1 text-left">
          {hasSelection ? (
            <div className="flex items-center gap-1 overflow-hidden">
              {multi && Array.isArray(value) && value.length > 1 ? (
                <span className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm">
                    {value.length}
                  </span>
                  <span className="font-bold text-gray-700 tracking-tight">Selected</span>
                </span>
              ) : (
                <span className="flex items-center gap-2 truncate">
                  <span className="font-mono text-[10px] bg-gray-100 px-1 rounded text-gray-500">{selectedOptions[0]?.id}</span>
                  <span className="font-medium text-gray-700 truncate">{selectedOptions[0]?.name}</span>
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 italic">All Items</span>
          )}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] animate-in slide-in-from-top-1 overflow-hidden flex flex-col max-h-64">
          <div className="p-2 border-b border-gray-50 flex items-center gap-2 sticky top-0 bg-white z-10">
            <Search size={12} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full text-xs font-bold outline-none placeholder:font-normal placeholder:text-gray-300"
            />
          </div>
          <div className="overflow-y-auto custom-scrollbar flex-1">
            <button
              onClick={() => handleSelect("")}
              className={`w-full px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-gray-50 ${!hasSelection ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500'}`}
            >
              All Items
            </button>
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors hover:bg-gray-50 ${isSelected(option.id) ? 'bg-indigo-50' : ''}`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className={`font-mono text-[10px] px-1 rounded ${isSelected(option.id) ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{option.id}</span>
                    <span className={`truncate ${isSelected(option.id) ? 'font-black text-indigo-700' : 'font-bold text-gray-700'}`}>{option.name}</span>
                  </div>
                  {isSelected(option.id) && <Check size={12} className="text-indigo-600 flex-shrink-0" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest italic bg-gray-50/50">
                {emptyLabel}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
