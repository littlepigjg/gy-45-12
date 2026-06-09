import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="w-5 h-5 text-neon-lime" />;
    case 'error':
      return <AlertCircle className="w-5 h-5 text-rose-400" />;
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-neon-amber" />;
    case 'info':
    default:
      return <Info className="w-5 h-5 text-neon-cyan" />;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  const value: ToastContextValue = {
    showToast,
    showSuccess: (m) => showToast(m, 'success'),
    showError: (m) => showToast(m, 'error'),
    showInfo: (m) => showToast(m, 'info'),
    showWarning: (m) => showToast(m, 'warning'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto min-w-[280px] max-w-md rounded-lg border px-4 py-3 shadow-xl backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-right duration-300',
              toast.type === 'success' && 'bg-neon-lime/10 border-neon-lime/30',
              toast.type === 'error' && 'bg-rose-500/10 border-rose-500/30',
              toast.type === 'warning' && 'bg-neon-amber/10 border-neon-amber/30',
              toast.type === 'info' && 'bg-neon-cyan/10 border-neon-cyan/30'
            )}
            style={{ animation: 'slideInRight 0.3s ease-out' }}
          >
            <div className="shrink-0 mt-0.5">
              <ToastIcon type={toast.type} />
            </div>
            <div className="flex-1 text-sm text-slate-200 leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
