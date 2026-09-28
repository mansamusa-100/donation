import { useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

type DownloadShareCardButtonProps = {
  slug: string;
  title: string;
  raisedAmount: number;
};

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
  );
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export function DownloadShareCardButton({ slug, title, raisedAmount }: DownloadShareCardButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cardUrl = `${API_BASE}/api/campaigns/${encodeURIComponent(slug)}/share-card.jpg?v=${Math.round(raisedAmount)}`;
  const fileName = `barakahfund-${slug}.jpg`;

  const handleDownload = async () => {
    setError('');
    setBusy(true);
    try {
      const response = await fetch(cardUrl, { credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });

      if (isMobileDevice() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          // Share sheet failed for another reason — fall back to a plain download.
        }
      }

      triggerBlobDownload(blob, fileName);
    } catch {
      // Fetch blocked or failed — let the server send it as an attachment instead.
      try {
        const a = document.createElement('a');
        a.href = `${cardUrl}&download=1`;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        setError('Could not download the image. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-2 text-sm font-semibold text-surface-700 shadow-sm hover:bg-surface-50 disabled:opacity-60">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
        </svg>
        {busy ? 'Preparing image…' : 'Download image'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
