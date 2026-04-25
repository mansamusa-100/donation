import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';

interface DataLoadAlertProps {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}

export function DataLoadAlert({ message, onRetry, retryLabel = 'Try again' }: DataLoadAlertProps) {
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-900">
      <div className="flex items-start gap-3">
        <AlertCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-sm">Could not load data</p>
          <p className="text-sm opacity-90 mt-0.5">{message}</p>
          <p className="text-xs mt-2 text-red-800/80">
            Check that the API is running and <code className="font-mono bg-red-100/80 px-1 rounded">VITE_API_BASE_URL</code>{' '}
            points to it (e.g. <code className="font-mono bg-red-100/80 px-1 rounded">http://localhost:4000</code>).
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-900 text-white text-sm font-bold hover:bg-red-800 transition-colors shrink-0">
        <RefreshCwIcon className="w-4 h-4" />
        {retryLabel}
      </button>
    </div>
  );
}
