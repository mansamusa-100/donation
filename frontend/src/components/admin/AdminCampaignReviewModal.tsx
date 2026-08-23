import { useEffect } from 'react';
import { ExternalLinkIcon, X } from 'lucide-react';
import { mediaUrl } from '../../lib/mediaUrl';
import type { AdminCampaign } from '../../types/admin';

function formatGmd(amount: number) {
  return `D${amount.toLocaleString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

type Props = {
  campaign: AdminCampaign;
  busy?: boolean;
  onClose: () => void;
  onViewId?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
};

/**
 * Full campaign inspection before approve/reject.
 * Uses queue payload (story, gallery, dates, contact) — public page stays closed until Active.
 */
export function AdminCampaignReviewModal({
  campaign,
  busy = false,
  onClose,
  onViewId,
  onApprove,
  onReject
}: Props) {
  const gallery = campaign.galleryImages ?? [];
  const showId = Boolean(campaign.verificationDocumentUrl || campaign.creator?.hasKycDocument);
  const canDecide = campaign.status === 'PendingReview';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-campaign-review-title">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Close review"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-white/95 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Preview · not live on the public site
            </p>
            <h2
              id="admin-campaign-review-title"
              className="font-display font-bold text-xl text-slate-900 mt-0.5 truncate">
              {campaign.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div className="rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
            <img
              src={mediaUrl(campaign.coverImage)}
              alt=""
              className="w-full max-h-64 object-cover"
            />
          </div>

          {gallery.length > 0 ? (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Gallery</h3>
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {gallery.map((src) => (
                  <li key={src} className="rounded-lg overflow-hidden border border-slate-100 h-24">
                    <img src={mediaUrl(src)} alt="" className="w-full h-full object-cover" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">{campaign.status}</span>
            <span className="px-2 py-1 rounded-md bg-brand-50 text-brand-800">{campaign.category}</span>
            {campaign.isTrending ? (
              <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-800">Trending</span>
            ) : null}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Goal</p>
              <p className="font-semibold text-slate-900 mt-0.5">{formatGmd(campaign.goalAmount)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">End date</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {campaign.endsAt ? formatDate(campaign.endsAt) : '—'}
                {typeof campaign.daysLeft === 'number' ? (
                  <span className="text-slate-500 font-normal"> · {campaign.daysLeft} days</span>
                ) : null}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:col-span-2">
              <p className="text-xs font-bold uppercase text-slate-500">Organizer</p>
              <p className="font-semibold text-slate-900 mt-0.5">{campaign.creatorName}</p>
              {campaign.creator ? (
                <p className="text-slate-600 mt-1">
                  {campaign.creator.fullName} · {campaign.creator.email}
                  {campaign.creator.phoneNumber ? ` · ${campaign.creator.phoneNumber}` : ''}
                  {campaign.creator.kycStatus ? ` · KYC ${campaign.creator.kycStatus}` : ''}
                </p>
              ) : null}
              <p className="text-xs text-slate-400 mt-1">Slug: {campaign.slug}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Short summary</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{campaign.shortDescription}</p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Full story</h3>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed rounded-xl border border-slate-100 bg-slate-50/50 p-4 max-h-80 overflow-y-auto">
              {campaign.fullDescription}
            </div>
          </div>

          {(campaign.showPublicContact ||
            campaign.contactPhone ||
            campaign.contactWhatsApp) && (
            <div className="rounded-xl border border-slate-100 p-3 text-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-1">Public contact (opt-in)</h3>
              <p className="text-slate-600">
                Shown on page:{' '}
                <span className="font-semibold">{campaign.showPublicContact ? 'Yes' : 'No'}</span>
              </p>
              {campaign.contactPhone ? <p className="mt-1">Phone: {campaign.contactPhone}</p> : null}
              {campaign.contactWhatsApp ? (
                <p className="mt-1">WhatsApp: {campaign.contactWhatsApp}</p>
              ) : null}
            </div>
          )}

          <div className="text-xs text-slate-500">
            Submitted {formatDate(campaign.createdAt)}
            {campaign.termsAcceptedAt
              ? ` · Terms accepted ${formatDate(campaign.termsAcceptedAt)}`
              : ''}
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-wrap gap-2 px-5 py-4 border-t border-slate-100 bg-white">
          {showId && onViewId ? (
            <button
              type="button"
              onClick={onViewId}
              className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-800 font-bold text-sm hover:bg-slate-50 inline-flex items-center gap-1.5">
              <ExternalLinkIcon className="w-4 h-4" />
              View ID document
            </button>
          ) : null}
          {canDecide && onApprove ? (
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="px-4 py-2.5 rounded-lg bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-50">
              Approve
            </button>
          ) : null}
          {canDecide && onReject ? (
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="px-4 py-2.5 rounded-lg border-2 border-red-200 text-red-700 font-bold text-sm hover:bg-red-50 disabled:opacity-50">
              Reject
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 ml-auto">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
