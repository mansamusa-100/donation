import { useState } from 'react';
import { HeartIcon, Loader2Icon } from 'lucide-react';
import type { Donor } from '../types/campaign';
import { api } from '../lib/api';
import { toUserFriendlyError } from '../lib/userFriendlyError';

const PREVIEW_COUNT = 5;

interface DonorWallProps {
  donors: Donor[];
  campaignSlug: string;
  donorCount: number;
}

export function DonorWall({ donors, campaignSlug, donorCount }: DonorWallProps) {
  const [expanded, setExpanded] = useState(false);
  const [allDonors, setAllDonors] = useState<Donor[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState('');

  if (donors.length === 0 && donorCount === 0) {
    return (
      <div className="text-center py-8 bg-surface-50 rounded-2xl border border-surface-100">
        <HeartIcon className="w-8 h-8 text-surface-300 mx-auto mb-3" />
        <p className="text-surface-500 font-medium">Be the first to donate!</p>
      </div>
    );
  }

  const preview = donors.slice(0, PREVIEW_COUNT);
  const visible = expanded && allDonors ? allDonors : preview;
  const canExpand = donorCount > PREVIEW_COUNT || donors.length > PREVIEW_COUNT;

  const handleSeeAll = async () => {
    setError('');
    if (allDonors) {
      setExpanded(true);
      return;
    }
    setLoadingAll(true);
    try {
      const list = await api.getCampaignDonations(campaignSlug);
      setAllDonors(list);
      setExpanded(true);
    } catch (err) {
      setError(toUserFriendlyError(err, 'Could not load all donors. Please try again.'));
    } finally {
      setLoadingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      {visible.map((donor) => (
        <div
          key={donor.id}
          className="flex gap-4 p-4 bg-white rounded-2xl border border-surface-100 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
            {donor.avatarUrl ? (
              <img
                src={donor.avatarUrl}
                alt={donor.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <HeartIcon className="w-5 h-5 text-brand-500" />
            )}
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
            {donor.message && (
              <p className="text-sm text-surface-600 bg-surface-50 p-3 rounded-xl rounded-tl-none">
                &ldquo;{donor.message}&rdquo;
              </p>
            )}
          </div>
        </div>
      ))}

      {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}

      {canExpand && !expanded ? (
        <button
          type="button"
          onClick={() => void handleSeeAll()}
          disabled={loadingAll}
          className="w-full py-3 text-sm font-semibold text-surface-600 hover:text-brand-600 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2">
          {loadingAll ? (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Loading…
            </>
          ) : (
            `See all donors${donorCount > PREVIEW_COUNT ? ` (${donorCount})` : ''}`
          )}
        </button>
      ) : null}

      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full py-3 text-sm font-semibold text-surface-600 hover:text-brand-600 transition-colors">
          Show less
        </button>
      ) : null}
    </div>
  );
}
