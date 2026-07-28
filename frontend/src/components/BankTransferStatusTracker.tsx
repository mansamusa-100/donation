import type { BankTransferStatus } from '../types/bank';

const STEPS: { key: BankTransferStatus | 'Initiated'; label: string; description: string }[] = [
  {
    key: 'Initiated',
    label: 'Instructions sent',
    description: 'You received a reference and bank details'
  },
  {
    key: 'Pending',
    label: 'Awaiting confirmation',
    description: 'Our team verifies your transfer after you send funds'
  },
  {
    key: 'Confirmed',
    label: 'Confirmed',
    description: 'Donation recorded on the campaign'
  }
];

function stepIndex(status: BankTransferStatus): number {
  switch (status) {
    case 'Pending':
      return 1;
    case 'Confirmed':
      return 2;
    case 'Rejected':
    case 'Expired':
      return 1;
    default:
      return 0;
  }
}

interface BankTransferStatusTrackerProps {
  status: BankTransferStatus;
  className?: string;
}

/**
 * Visual status steps for bank-transfer donations (Pending → Confirmed).
 */
export function BankTransferStatusTracker({ status, className = '' }: BankTransferStatusTrackerProps) {
  const active = stepIndex(status);
  const failed = status === 'Rejected' || status === 'Expired';

  return (
    <div className={`rounded-2xl border border-surface-200 bg-white p-4 text-left ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Transfer status</p>
      <ol className="space-y-3">
        {STEPS.map((step, index) => {
          const done = !failed && index < active;
          const current = !failed && index === active;
          const isFailStep = failed && index === 1;

          return (
            <li key={step.key} className="flex gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isFailStep
                    ? 'bg-red-600 text-white'
                    : done || current
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-100 text-surface-400'
                }`}>
                {done ? '✓' : index + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    isFailStep
                      ? 'text-red-700'
                      : current || done
                        ? 'text-surface-900'
                        : 'text-surface-400'
                  }`}>
                  {isFailStep ? status : step.label}
                </p>
                <p className="text-xs text-surface-500">
                  {isFailStep
                    ? status === 'Expired'
                      ? 'This transfer request expired before confirmation'
                      : 'This transfer was not confirmed'
                    : step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
