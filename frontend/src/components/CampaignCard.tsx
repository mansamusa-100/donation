import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UsersIcon, ClockIcon } from 'lucide-react';
import type { Campaign } from '../types/campaign';
import { mediaUrl } from '../lib/mediaUrl';
import { ProgressBar } from './ProgressBar';
import { CategoryBadge } from './CategoryBadge';
interface CampaignCardProps {
  campaign: Campaign;
}
export function CampaignCard({ campaign }: CampaignCardProps) {
  const progress = campaign.raisedAmount / campaign.goalAmount * 100;
  const isEnded = campaign.status === 'Ended';
  return (
    <motion.div
      whileHover={{
        y: -4
      }}
      className="bg-white rounded-2xl overflow-hidden shadow-warm hover:shadow-warm-lg transition-all duration-300 flex flex-col h-full">
      
      <Link to={`/campaign/${campaign.slug}`} className="flex-1 flex flex-col">
        <div className="relative h-48 overflow-hidden">
          <img
            src={mediaUrl(campaign.coverImage)}
            alt={campaign.title}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
          
          <div className="absolute top-3 left-3 flex flex-wrap gap-2">
            <CategoryBadge category={campaign.category} />
            {isEnded ? (
              <span className="inline-flex items-center rounded-full bg-surface-900/80 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                Ended
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-5 flex flex-col flex-1">
          <h3 className="font-display font-bold text-lg text-surface-900 mb-2 line-clamp-2">
            {campaign.title}
          </h3>
          <p className="text-surface-500 text-sm mb-4 line-clamp-2 flex-1">
            {campaign.shortDescription}
          </p>

          <div className="mt-auto space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-bold text-brand-600">
                  D{campaign.raisedAmount.toLocaleString()}
                </span>
                <span className="text-surface-500">
                  of D{campaign.goalAmount.toLocaleString()}
                </span>
              </div>
              <ProgressBar progress={progress} size="sm" />
            </div>

            <div className="flex items-center justify-between text-xs text-surface-500 pt-3 border-t border-surface-100">
              <div className="flex items-center gap-1.5">
                <UsersIcon className="w-4 h-4" />
                <span>{campaign.donorCount} donors</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4" />
                <span>{isEnded ? 'Completed' : `${campaign.daysLeft} days left`}</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>);

}
