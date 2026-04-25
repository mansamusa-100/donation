import { HeartIcon } from 'lucide-react';
import type { Donor } from '../types/campaign';
interface DonorWallProps {
  donors: Donor[];
}
export function DonorWall({ donors }: DonorWallProps) {
  if (donors.length === 0) {
    return (
      <div className="text-center py-8 bg-surface-50 rounded-2xl border border-surface-100">
        <HeartIcon className="w-8 h-8 text-surface-300 mx-auto mb-3" />
        <p className="text-surface-500 font-medium">Be the first to donate!</p>
      </div>);

  }
  return (
    <div className="space-y-4">
      {donors.map((donor) =>
      <div
        key={donor.id}
        className="flex gap-4 p-4 bg-white rounded-2xl border border-surface-100 shadow-sm">
        
          <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
            {donor.avatarUrl ?
          <img
            src={donor.avatarUrl}
            alt={donor.name}
            className="w-full h-full rounded-full object-cover" /> :


          <HeartIcon className="w-5 h-5 text-brand-500" />
          }
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start mb-1">
              <h4 className="font-semibold text-surface-900">
                {donor.isAnonymous ? 'Anonymous' : donor.name}
              </h4>
              <span className="font-bold text-brand-600">
                {donor.currency === 'GMD' ? 'D' : '$'}
                {donor.amount.toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-surface-400 mb-2">{donor.timeAgo}</div>
            {donor.message &&
          <p className="text-sm text-surface-600 bg-surface-50 p-3 rounded-xl rounded-tl-none">
                "{donor.message}"
              </p>
          }
          </div>
        </div>
      )}
      <button className="w-full py-3 text-sm font-semibold text-surface-600 hover:text-brand-600 transition-colors">
        See all donors
      </button>
    </div>);

}
