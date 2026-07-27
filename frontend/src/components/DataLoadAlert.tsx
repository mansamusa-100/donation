import { AlertCircleIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react';

interface DataLoadAlertProps {
  message?: string;
  onRetry: () => void;
  retryLabel?: string;
}

/**
 * Friendly load-failure banner for poor network / temporary outages.
 * Never shows developer env/API instructions to end users.
 */
export function DataLoadAlert({
  message,
  onRetry,
  retryLabel = 'Try again'
}: DataLoadAlertProps) {
  const body =
    message?.trim() ||
    'Please check your internet connection and try again. If the problem continues, wait a moment and retry.';

  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950">
      <div className="flex items-start gap-3">
        <WifiOffIcon className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" aria-hidden />
        <div>
          <p className="font-bold text-sm text-surface-900">Unable to load right now</p>
          <p className="text-sm text-surface-700 mt-1 leading-relaxed">{body}</p>
          <p className="text-xs text-surface-500 mt-2 flex items-center gap-1.5">
            <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
            This is usually a temporary connection issue.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-colors shrink-0 shadow-sm">
        <RefreshCwIcon className="w-4 h-4" />
        {retryLabel}
      </button>
    </div>
  );
}
