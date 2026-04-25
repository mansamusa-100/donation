import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchIcon, FilterIcon } from 'lucide-react';
import type { Campaign, Category, CategorySummary } from '../types/campaign';
import { CampaignCard } from '../components/CampaignCard';
import { DataLoadAlert } from '../components/DataLoadAlert';
import { api } from '../lib/api';

type SortOption = 'trending' | 'newest' | 'funded';

export function ExplorePage() {
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') as Category | null;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>(
    categoryParam && ['Medical', 'Education', 'Business', 'Community', 'Emergency', 'Other'].includes(categoryParam)
      ? categoryParam
      : 'All'
  );
  const [sortBy, setSortBy] = useState<SortOption>('trending');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (
      categoryParam &&
      ['Medical', 'Education', 'Business', 'Community', 'Emergency', 'Other'].includes(categoryParam)
    ) {
      setSelectedCategory(categoryParam);
    }
  }, [categoryParam]);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage('');
    try {
      const [campaignData, categoryData] = await Promise.all([api.getCampaigns(), api.getCategories()]);
      setCampaigns(campaignData);
      setCategories(categoryData);
      setLoadState('ready');
    } catch (err) {
      console.error('Failed to load explore page data:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
      setLoadState('error');
      setCampaigns([]);
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCampaigns = campaigns
    .filter((campaign) => {
      const matchesSearch =
        campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        campaign.shortDescription.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || campaign.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'trending') {
        return (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0);
      }
      if (sortBy === 'funded') {
        return b.raisedAmount / b.goalAmount - a.raisedAmount / a.goalAmount;
      }
      if (sortBy === 'newest') {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      }
      return 0;
    });

  return (
    <div className="min-h-screen bg-surface-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center max-w-2xl mx-auto">
          <h1 className="text-4xl font-display font-bold text-surface-900 mb-4">Explore Campaigns</h1>
          <p className="text-surface-600 text-lg">
            Discover and support causes that are making a difference across The Gambia.
          </p>
        </div>

        {loadState === 'error' && (
          <div className="mb-6">
            <DataLoadAlert message={errorMessage} onRetry={() => void load()} />
          </div>
        )}

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-surface-200 mb-8 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-surface-50 border-none focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>

          <div className="flex w-full md:w-auto gap-4">
            <div className="relative flex-1 md:w-48">
              <select
                aria-label="Filter campaigns by category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as Category | 'All')}
                className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl bg-surface-50 border-none focus:ring-2 focus:ring-brand-500 outline-none font-medium text-surface-700 cursor-pointer">
                <option value="All">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <FilterIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
            </div>

            <div className="relative flex-1 md:w-48">
              <select
                aria-label="Sort campaigns by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl bg-surface-50 border-none focus:ring-2 focus:ring-brand-500 outline-none font-medium text-surface-700 cursor-pointer">
                <option value="trending">Trending</option>
                <option value="funded">Most Funded</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>
        </div>

        {loadState === 'loading' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-[360px] rounded-2xl bg-surface-200/60 animate-pulse border border-surface-200" />
            ))}
          </div>
        )}

        {loadState !== 'loading' && filteredCampaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}

        {loadState === 'ready' && filteredCampaigns.length === 0 && (
          <div className="text-center py-24 bg-white rounded-2xl border border-surface-200">
            <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <SearchIcon className="w-8 h-8 text-surface-400" />
            </div>
            <h3 className="text-xl font-bold text-surface-900 mb-2">
              {campaigns.length === 0 ? 'No active campaigns yet' : 'No campaigns match your filters'}
            </h3>
            <p className="text-surface-500">
              {campaigns.length === 0
                ? 'Create one or run the database seed to see campaigns here.'
                : 'Try adjusting your search or filters.'}
            </p>
            {campaigns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('All');
                }}
                className="mt-6 text-brand-600 font-semibold hover:text-brand-700">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
