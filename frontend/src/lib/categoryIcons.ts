import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangleIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  MoreHorizontalIcon,
  StoreIcon,
  UsersIcon } from
'lucide-react';
import type { Category, CategoryIconName } from '../types/campaign';

export const CATEGORY_ICON_BY_CATEGORY: Record<Category, LucideIcon> = {
  Medical: HeartPulseIcon,
  Education: GraduationCapIcon,
  Business: StoreIcon,
  Community: UsersIcon,
  Emergency: AlertTriangleIcon,
  Other: MoreHorizontalIcon
};

export const CATEGORY_ICON_BY_NAME: Record<CategoryIconName, LucideIcon> = {
  HeartPulseIcon,
  GraduationCapIcon,
  StoreIcon,
  UsersIcon,
  AlertTriangleIcon,
  MoreHorizontalIcon
};
