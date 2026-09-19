import { BRAND_LOGO_SRC, BRAND_NAME } from '../lib/brand';
import { mediaUrl } from '../lib/mediaUrl';

type SharePreviewCardProps = {
  title: string;
  creatorName: string;
  coverImage: string;
  raisedAmount: number;
  goalAmount: number;
};

export function SharePreviewCard({
  title,
  creatorName,
  coverImage,
  raisedAmount,
  goalAmount
}: SharePreviewCardProps) {
  const progress = Math.min(100, Math.max(0, Math.round((raisedAmount / Math.max(1, goalAmount)) * 100)));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = (progress / 100) * circumference;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm"
      aria-hidden="true">
      <div className="grid grid-cols-[1.15fr_0.85fr] min-h-[168px] sm:min-h-[200px]">
        <div className="relative z-10 flex flex-col justify-between p-4 sm:p-5 bg-gradient-to-r from-white via-white to-white/80">
          <div>
            <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 rounded-lg object-contain mb-3" />
            <h4 className="font-display font-bold text-surface-900 text-base sm:text-lg leading-snug line-clamp-3">
              {title}
            </h4>
            <p className="mt-2 text-xs text-surface-400">Organized by</p>
            <p className="text-sm font-semibold text-surface-600 truncate">{creatorName}</p>
          </div>
          <p className="mt-3 text-xs font-semibold text-brand-600">{BRAND_NAME}</p>
        </div>

        <div className="relative min-h-[168px] sm:min-h-[200px]">
          <img
            src={mediaUrl(coverImage)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent" />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 sm:left-[48%] sm:translate-x-0 sm:bottom-4">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-md">
          <svg className="absolute inset-1" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="4" />
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              stroke="#059669"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 22 22)"
            />
          </svg>
          <span className="relative text-[11px] font-bold text-surface-900">{progress}%</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow-sm whitespace-nowrap">
            D{Math.round(raisedAmount).toLocaleString()} raised
          </span>
          <span className="inline-flex rounded-full bg-teal-700 px-3 py-1 text-xs font-bold text-white shadow-sm whitespace-nowrap">
            Donate now →
          </span>
        </div>
      </div>
    </div>
  );
}
