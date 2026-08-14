import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheckIcon, UsersIcon, ClockIcon, HeartIcon, PhoneIcon, MessageCircleIcon } from 'lucide-react';
import { ProgressBar } from '../components/ProgressBar';
import { CategoryBadge } from '../components/CategoryBadge';
import { ShareButtons } from '../components/ShareButtons';
import { DonorWall } from '../components/DonorWall';
import { DonateModal } from '../components/DonateModal';
import { Avatar } from '../components/Avatar';
import { RouteLoader } from '../components/RouteLoader';
import { DataLoadAlert } from '../components/DataLoadAlert';
import { toUserFriendlyError } from '../lib/userFriendlyError';
import type { Campaign } from '../types/campaign';
import { mediaUrl } from '../lib/mediaUrl';
import { api } from '../lib/api';
import { telHref, whatsappHref, BRAND_NAME } from '../lib/brand';

export function CampaignDetailPage() {
  const { slug } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDonateModalOpen, setIsDonateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'story' | 'updates'>('story');

  const load = useCallback(async () => {
    if (!slug) {
      setLoadState('notfound');
      return;
    }
    setLoadState('loading');
    setErrorMessage('');
    try {
      const campaignData = await api.getCampaignBySlug(slug);
      setCampaign(campaignData);
      setLoadState('ready');
    } catch (err) {
      console.error(`Failed to load campaign ${slug}:`, err);
      const msg = toUserFriendlyError(err, 'We could not load this campaign. Please try again.');
      const isNotFound =
        msg.toLowerCase().includes('not found') ||
        (err instanceof Error && /status 404/i.test(err.message));
      if (isNotFound) {
        setLoadState('notfound');
        setCampaign(null);
      } else {
        setErrorMessage(msg);
        setLoadState('error');
        setCampaign(null);
      }
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaign) {
      return;
    }
    const previous = document.title;
    document.title = `${campaign.title} · BarakahFund`;
    return () => {
      document.title = previous;
    };
  }, [campaign]);

  if (loadState === 'loading') {
    return <RouteLoader />;
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-[60vh] max-w-lg mx-auto px-4 py-16">
        <DataLoadAlert message={errorMessage} onRetry={() => void load()} />
        <div className="mt-8 text-center">
          <Link to="/explore" className="text-brand-600 font-semibold hover:text-brand-700">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  if (loadState === 'notfound' || !campaign) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-2xl font-bold text-surface-900 mb-2">Campaign Not Found</h2>
        <p className="text-surface-500 mb-6">
          The campaign you are looking for does not exist or is not available on the public site.
        </p>
        <Link to="/explore" className="bg-brand-600 text-white px-6 py-3 rounded-xl font-bold">
          Explore Campaigns
        </Link>
      </div>
    );
  }

  const progress = (campaign.raisedAmount / campaign.goalAmount) * 100;
  const acceptingDonations = campaign.acceptingDonations !== false;
  const showPeriodEndedBanner = campaign.fundraisingPeriodEnded && acceptingDonations;

  return (
    <div className="bg-surface-50 min-h-screen pb-24">
      <div className="w-full h-[40vh] md:h-[50vh] relative">
        <img src={mediaUrl(campaign.coverImage)} alt={campaign.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900/80 via-surface-900/20 to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
            <CategoryBadge
              category={campaign.category}
              className="mb-4 bg-white/20 backdrop-blur-md text-white border border-white/30"
            />
            <h1 className="text-3xl md:text-5xl font-display font-bold text-white max-w-3xl leading-tight">
              {campaign.title}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {showPeriodEndedBanner && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong className="font-bold">Fundraising period ended.</strong> Donations are still accepted until the
            organizer confirms end of campaign.
          </div>
        )}
        {!acceptingDonations && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-surface-200 bg-surface-100 px-4 py-3 text-sm text-surface-700">
            {campaign.status === 'Ended'
              ? 'This campaign has finished. It remains available as a public record — donations are closed.'
              : 'This campaign is no longer accepting donations.'}
          </div>
        )}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="w-full lg:w-2/3 space-y-8">
            {campaign.galleryImages && campaign.galleryImages.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-surface-200">
                <h2 className="font-display font-bold text-surface-900 mb-3 text-sm uppercase tracking-wide">
                  More photos
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {campaign.galleryImages.map((src) => (
                    <div
                      key={src}
                      className="relative rounded-xl overflow-hidden border border-surface-200 aspect-[4/3]">
                      <img
                        src={mediaUrl(src)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-200">
              <div className="flex items-center gap-4">
                <Avatar
                  name={campaign.creatorName}
                  src={campaign.creatorAvatar}
                  sizeClassName="w-14 h-14"
                  textClassName="text-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-surface-500">Campaign Organizer</p>
                  <h3 className="font-bold text-surface-900 text-lg truncate">{campaign.creatorName}</h3>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-brand-600 bg-brand-50 px-3 py-1.5 rounded-lg text-sm font-semibold shrink-0">
                  <ShieldCheckIcon className="w-4 h-4" /> Verified
                </div>
              </div>
              {campaign.showPublicContact && (campaign.contactPhone || campaign.contactWhatsApp) && (
                <div className="mt-4 pt-4 border-t border-surface-100 flex flex-wrap gap-2">
                  {campaign.contactPhone && (
                    <a
                      href={telHref(campaign.contactPhone)}
                      className="inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-50 px-3.5 py-2 text-sm font-semibold text-surface-800 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                    >
                      <PhoneIcon className="w-4 h-4 text-brand-600" />
                      Call {campaign.contactPhone}
                    </a>
                  )}
                  {campaign.contactWhatsApp && (
                    <a
                      href={whatsappHref(
                        campaign.contactWhatsApp,
                        `Hi, I have a question about your ${BRAND_NAME} campaign: ${campaign.title}`
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 px-3.5 py-2 text-sm font-semibold text-surface-800 hover:bg-[#25D366]/20 transition-colors"
                    >
                      <MessageCircleIcon className="w-4 h-4 text-[#128C7E]" />
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-surface-200 overflow-hidden">
              <div className="flex border-b border-surface-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('story')}
                  className={`flex-1 py-4 font-bold text-center transition-colors ${
                    activeTab === 'story'
                      ? 'text-brand-600 border-b-2 border-brand-600'
                      : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'
                  }`}>
                  The Story
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('updates')}
                  className={`flex-1 py-4 font-bold text-center transition-colors ${
                    activeTab === 'updates'
                      ? 'text-brand-600 border-b-2 border-brand-600'
                      : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'
                  }`}>
                  Updates (0)
                </button>
              </div>

              <div className="p-6 md:p-8">
                {activeTab === 'story' ? (
                  <div className="prose prose-surface max-w-none">
                    {campaign.fullDescription.split('\n').map((paragraph, idx) => (
                      <p key={`${campaign.id}-${idx}`} className="mb-4 text-surface-700 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-surface-500">No updates posted yet.</div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-surface-200">
              <h3 className="font-display font-bold text-xl mb-4">Help by sharing</h3>
              <p className="text-surface-600 mb-6">Campaigns shared on social networks raise up to 5x more.</p>
              <ShareButtons
                url={`${window.location.origin}/campaign/${campaign.slug}`}
                title={campaign.title}
                description={campaign.shortDescription}
              />
            </div>
          </div>

          <div className="w-full lg:w-1/3 lg:sticky lg:top-28 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-warm border border-surface-200">
              <div className="mb-6">
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-display font-bold text-surface-900">
                    D{campaign.raisedAmount.toLocaleString()}
                  </span>
                  <span className="text-surface-500 font-medium mb-1">
                    raised of D{campaign.goalAmount.toLocaleString()}
                  </span>
                </div>
                <ProgressBar progress={progress} size="lg" />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-surface-50 p-4 rounded-xl text-center">
                  <UsersIcon className="w-6 h-6 text-surface-400 mx-auto mb-1" />
                  <div className="font-bold text-surface-900">{campaign.donorCount}</div>
                  <div className="text-xs text-surface-500">Donors</div>
                </div>
                <div className="bg-surface-50 p-4 rounded-xl text-center">
                  <ClockIcon className="w-6 h-6 text-surface-400 mx-auto mb-1" />
                  <div className="font-bold text-surface-900">{campaign.daysLeft}</div>
                  <div className="text-xs text-surface-500">Days Left</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDonateModalOpen(true)}
                disabled={!acceptingDonations}
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex justify-center items-center gap-2 mb-4 disabled:opacity-50 disabled:cursor-not-allowed">
                Donate Now <HeartIcon className="w-5 h-5 fill-current" />
              </button>

              <div className="text-center text-xs text-surface-500 flex items-center justify-center gap-1">
                <ShieldCheckIcon className="w-4 h-4" /> Secure payments via Banks & Local Wallets
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-200">
              <h3 className="font-display font-bold text-xl mb-6">Recent Donors</h3>
              <DonorWall
                donors={campaign.recentDonors}
                campaignSlug={campaign.slug}
                donorCount={campaign.donorCount}
              />
            </div>
          </div>
        </div>
      </div>

      {acceptingDonations && (
        <div className="lg:hidden fixed bottom-0 left-0 w-full p-4 bg-white border-t border-surface-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
          <button
            type="button"
            onClick={() => setIsDonateModalOpen(true)}
            className="w-full py-4 bg-brand-600 text-white rounded-xl font-bold text-lg shadow-lg">
            Donate Now
          </button>
        </div>
      )}

      <DonateModal
        isOpen={isDonateModalOpen}
        onClose={() => setIsDonateModalOpen(false)}
        campaignTitle={campaign.title}
        campaignSlug={campaign.slug}
      />
    </div>
  );
}
