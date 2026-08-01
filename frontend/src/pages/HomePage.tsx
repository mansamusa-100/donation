import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  HeartHandshakeIcon,
  SearchIcon,
  ShieldCheckIcon,
  WalletIcon
} from 'lucide-react';
import { CampaignCard } from '../components/CampaignCard';
import { StatsCounter } from '../components/StatsCounter';
import { DataLoadAlert } from '../components/DataLoadAlert';
import type { Campaign, CategorySummary, PlatformStats } from '../types/campaign';
import { CATEGORY_ICON_BY_NAME } from '../lib/categoryIcons';
import { api } from '../lib/api';
import { toUserFriendlyError } from '../lib/userFriendlyError';
import { useAuth } from '../context/AuthContext';
import { BRAND_NAME } from '../lib/brand';

const emptyStats: PlatformStats = {
  totalRaised: 0,
  campaignsFunded: 0,
  totalDonors: 0,
  communitiesHelped: 0
};

function TrendingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[340px] rounded-2xl bg-surface-200/60 animate-pulse border border-surface-200"
        />
      ))}
    </div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [stats, setStats] = useState<PlatformStats>(emptyStats);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage('');
    try {
      const [campaignData, categoryData, statsData] = await Promise.all([
        api.getCampaigns({ sort: 'newest' }),
        api.getCategories(),
        api.getStats()
      ]);
      setCampaigns(campaignData.filter((c) => c.status !== 'Ended'));
      setCategories(categoryData);
      setStats({ ...emptyStats, ...statsData });
      setLoadState('ready');
    } catch (err) {
      console.error('Failed to load home page data:', err);
      setErrorMessage(
        toUserFriendlyError(err, 'We could not load the page. Please check your connection and try again.')
      );
      setLoadState('error');
      setCampaigns([]);
      setCategories([]);
      setStats(emptyStats);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const featuredCampaigns = campaigns.slice(0, 4);

  return (
    <div className="min-h-screen">
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-brand-50/50 -z-10"></div>
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[800px] h-[800px] bg-brand-200/30 rounded-full blur-3xl -z-10"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto">
            <span className="inline-block py-1 px-3 rounded-full bg-brand-100 text-brand-700 text-sm font-bold mb-6">
              Crowdfunding with purpose
            </span>
            <h1 className="text-5xl md:text-6xl font-display font-extrabold text-surface-900 tracking-tight mb-6 text-balance">
              Give with heart, <br />
              <span className="text-brand-600">support real impact</span>
            </h1>
            <p className="text-lg md:text-xl text-surface-600 mb-10 text-balance">
              Raise funds for medical emergencies, education, local businesses, and community projects.
              Support causes that matter to you, directly from your mobile wallet or card.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              {user?.role === 'ADMIN' ? (
                <Link
                  to="/admin"
                  className="w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all">
                  Open admin dashboard
                </Link>
              ) : (
                <Link
                  to="/dashboard"
                  className="w-full sm:w-auto px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all">
                  Start a Campaign
                </Link>
              )}
              <Link
                to="/explore"
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-surface-50 text-surface-900 rounded-xl font-bold text-lg shadow-sm border border-surface-200 transition-all">
                Explore Causes
              </Link>
            </div>

            <div className="max-w-xl mx-auto relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <SearchIcon className="w-5 h-5 text-surface-400 group-focus-within:text-brand-600 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search for campaigns, people, or places..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-surface-200 focus:border-brand-500 focus:ring-0 outline-none shadow-sm text-surface-900 transition-all"
              />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 bg-white border-y border-surface-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          {loadState === 'error' && (
            <DataLoadAlert message={errorMessage} onRetry={() => void load()} />
          )}
          <div
            className={`grid grid-cols-2 md:grid-cols-4 gap-6 ${loadState === 'loading' ? 'opacity-60 pointer-events-none' : ''}`}>
            <StatsCounter value={stats.totalRaised} label="Dalasi Raised" prefix="D" />
            <StatsCounter value={stats.campaignsFunded} label="Campaigns Funded" />
            <StatsCounter value={stats.totalDonors} label="Generous Donors" />
            <StatsCounter value={stats.communitiesHelped} label="Communities Helped" />
          </div>
        </div>
      </section>

      <section className="py-24 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="text-3xl font-display font-bold text-surface-900 mb-2">New Campaigns</h2>
              {/* Switch back to trending when more campaigns are marked trending. */}
            </div>
            <Link
              to="/explore"
              className="hidden sm:flex items-center gap-2 text-brand-600 font-semibold hover:text-brand-700 transition-colors">
              View all <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>

          {loadState === 'loading' && <TrendingSkeleton />}

          {loadState !== 'loading' && featuredCampaigns.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredCampaigns.map((campaign, index) => (
                <motion.div
                  key={campaign.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="h-full">
                  <CampaignCard campaign={campaign} />
                </motion.div>
              ))}
            </div>
          )}

          {loadState === 'ready' && featuredCampaigns.length === 0 && (
            <div className="text-center py-16 px-4 bg-white rounded-2xl border border-surface-200">
              <p className="text-surface-700 font-semibold mb-2">No campaigns yet</p>
              <p className="text-surface-500 text-sm mb-6 max-w-md mx-auto">
                Be the first to start a campaign, or check Explore once new causes go live.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  to="/explore"
                  className="px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700">
                  Browse all campaigns
                </Link>
                {user?.role !== 'ADMIN' && (
                  <Link
                    to="/dashboard"
                    className="px-5 py-2.5 rounded-xl border border-surface-200 font-bold text-sm text-surface-800 hover:bg-surface-50">
                    Start a campaign
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 sm:hidden">
            <Link
              to="/explore"
              className="block w-full py-3 text-center bg-white border border-surface-200 rounded-xl font-semibold text-surface-700">
              View all campaigns
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold text-surface-900 mb-4">Browse by Category</h2>
            <p className="text-surface-500 max-w-2xl mx-auto">Discover campaigns that align with your passions and values.</p>
          </div>

          {loadState === 'loading' && categories.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-surface-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {categories.map((category) => {
                const IconComponent = CATEGORY_ICON_BY_NAME[category.icon];
                return (
                  <Link
                    key={category.name}
                    to={`/explore?category=${category.name}`}
                    className="group flex flex-col items-center p-6 bg-surface-50 rounded-2xl hover:bg-brand-50 border border-transparent hover:border-brand-200 transition-all text-center">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 group-hover:text-brand-600 transition-all text-surface-600">
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-surface-900 mb-1">{category.name}</h3>
                    <p className="text-xs text-surface-500">{category.count} campaigns</p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section id="how-it-works" className="py-24 bg-surface-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-display font-bold mb-4">How {BRAND_NAME} works</h2>
            <p className="text-surface-400 max-w-2xl mx-auto">Raising funds is simple, secure, and transparent.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-surface-800 -z-10"></div>

            {[
              {
                title: 'Create Your Campaign',
                desc: 'Tell your story, set a goal in Dalasi, and add photos or videos.',
                icon: HeartHandshakeIcon
              },
              {
                title: 'Share with Everyone',
                desc: 'Share your link via WhatsApp, Facebook, and Twitter to gather support.',
                icon: SearchIcon
              },
              {
                title: 'Receive Funds',
                desc: 'Withdraw directly to your Afrimoney, Wave, or QMoney wallet.',
                icon: WalletIcon
              }
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="w-24 h-24 mx-auto bg-surface-800 rounded-full flex items-center justify-center mb-6 border-8 border-surface-900 relative">
                  <step.icon className="w-10 h-10 text-brand-500" />
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                </div>
                <h3 className="text-xl font-display font-bold mb-3">{step.title}</h3>
                <p className="text-surface-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-brand-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-warm flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <h2 className="text-3xl font-display font-bold text-surface-900 mb-6">Built for Trust & Security</h2>
              <ul className="space-y-6">
                <li className="flex gap-4">
                  <div className="mt-1 bg-brand-100 p-2 rounded-lg text-brand-600">
                    <ShieldCheckIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-surface-900 text-lg">Verified Campaigns</h4>
                    <p className="text-surface-600">
                      Our team reviews campaigns to prevent fraud and ensure authenticity.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="mt-1 bg-brand-100 p-2 rounded-lg text-brand-600">
                    <WalletIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-surface-900 text-lg">Secure Local & Global Payments</h4>
                    <p className="text-surface-600">
                      Donate safely using local mobile money or international cards via Stripe.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="flex-1 w-full relative">
              <img
                src="https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=800&q=80"
                alt="Trust"
                className="rounded-2xl shadow-lg object-cover h-80 w-full"
              />
              <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-xl shadow-warm flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                  <ShieldCheckIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-surface-900">100% Secure</div>
                  <div className="text-xs text-surface-500">Donation Guarantee</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
