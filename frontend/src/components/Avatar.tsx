import { mediaUrl } from '../lib/mediaUrl';

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return `${first}${last}`.toUpperCase() || '?';
}

interface AvatarProps {
  name: string;
  src?: string | null;
  /** Tailwind size classes, e.g. "w-14 h-14". */
  sizeClassName?: string;
  /** Tailwind text size for the initials fallback, e.g. "text-lg". */
  textClassName?: string;
  className?: string;
}

/**
 * Shows the person's real photo when available; otherwise a neutral
 * initials badge — never a demo/placeholder photo.
 */
export function Avatar({
  name,
  src,
  sizeClassName = 'w-10 h-10',
  textClassName = 'text-sm',
  className = ''
}: AvatarProps) {
  if (src) {
    return (
      <img
        src={mediaUrl(src)}
        alt={name}
        className={`${sizeClassName} rounded-full object-cover bg-surface-100 ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${sizeClassName} rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold select-none ${textClassName} ${className}`}>
      {initialsFromName(name)}
    </div>
  );
}
