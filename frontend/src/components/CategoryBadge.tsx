import type { Category } from '../types/campaign';
import { CATEGORY_ICON_BY_CATEGORY } from '../lib/categoryIcons';

interface CategoryBadgeProps {
  category: Category;
  className?: string;
}

const CATEGORY_STYLES: Record<
  Category,
  {
    color: string;
    bg: string;
  }
> = {
  Medical: {
    color: 'text-gambia-red',
    bg: 'bg-red-50'
  },
  Education: {
    color: 'text-gambia-blue',
    bg: 'bg-blue-50'
  },
  Business: {
    color: 'text-brand-600',
    bg: 'bg-brand-50'
  },
  Community: {
    color: 'text-amber-600',
    bg: 'bg-amber-50'
  },
  Emergency: {
    color: 'text-orange-600',
    bg: 'bg-orange-50'
  },
  Other: {
    color: 'text-surface-600',
    bg: 'bg-surface-100'
  }
};

export function CategoryBadge({
  category,
  className = ''
}: CategoryBadgeProps) {
  const IconComponent = CATEGORY_ICON_BY_CATEGORY[category];
  const styles = CATEGORY_STYLES[category];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${styles.bg} ${styles.color} ${className}`}>
      <IconComponent className="w-3.5 h-3.5" />
      {category}
    </span>
  );
}
