import { useEffect, useCallback } from 'react';
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { mediaUrl } from '../lib/mediaUrl';

type ImageLightboxProps = {
  images: string[];
  index: number;
  alt?: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

export function ImageLightbox({ images, index, alt = 'Campaign photo', onClose, onIndexChange }: ImageLightboxProps) {
  const count = images.length;
  const safeIndex = ((index % count) + count) % count;
  const src = images[safeIndex];
  const hasMany = count > 1;

  const goPrev = useCallback(() => {
    if (!hasMany) {
      return;
    }
    onIndexChange((safeIndex - 1 + count) % count);
  }, [hasMany, onIndexChange, safeIndex, count]);

  const goNext = useCallback(() => {
    if (!hasMany) {
      return;
    }
    onIndexChange((safeIndex + 1) % count);
  }, [hasMany, onIndexChange, safeIndex, count]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'ArrowRight') {
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, goPrev, goNext]);

  if (!src) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-surface-900/90 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/20 transition-colors"
        aria-label="Close">
        <XIcon className="w-5 h-5" />
      </button>

      {hasMany && (
        <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm font-medium text-white/80 tabular-nums">
          {safeIndex + 1} / {count}
        </p>
      )}

      {hasMany && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 sm:left-4 z-10 rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/20 transition-colors"
          aria-label="Previous photo">
          <ChevronLeftIcon className="w-6 h-6" />
        </button>
      )}

      {hasMany && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-2 sm:right-4 z-10 rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/20 transition-colors"
          aria-label="Next photo">
          <ChevronRightIcon className="w-6 h-6" />
        </button>
      )}

      <img
        src={mediaUrl(src)}
        alt={alt}
        className="max-h-[88vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}
