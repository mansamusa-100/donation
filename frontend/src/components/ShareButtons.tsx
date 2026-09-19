import { useState } from 'react';
import { MessageCircleIcon, FacebookIcon, TwitterIcon, LinkIcon, CheckIcon } from 'lucide-react';
import { BRAND_NAME } from '../lib/brand';

interface ShareButtonsProps {
  url: string;
  title: string;
  /** Short campaign blurb used in WhatsApp / X / TikTok share text. */
  description?: string;
}

function withUtm(url: string, source: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('utm_source', source);
    parsed.searchParams.set('utm_medium', 'social');
    parsed.searchParams.set('utm_campaign', 'campaign_share');
    return parsed.toString();
  } catch {
    return url;
  }
}

function shareMessage(title: string, description: string | undefined, link: string): string {
  const blurb = description?.replace(/\s+/g, ' ').trim();
  if (blurb) {
    const short = blurb.length > 140 ? `${blurb.slice(0, 139).trimEnd()}…` : blurb;
    return `${title}\n\n${short}\n\nDonate on ${BRAND_NAME}:\n${link}`;
  }
  return `Support ${title} on ${BRAND_NAME}\n\n${link}`;
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.18 8.18 0 0 0 4.76 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export function ShareButtons({ url, title, description }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [tiktokHint, setTiktokHint] = useState(false);

  const whatsappUrl = withUtm(url, 'whatsapp');
  const facebookUrl = withUtm(url, 'facebook');
  const twitterUrl = withUtm(url, 'twitter');
  const tiktokUrl = withUtm(url, 'tiktok');

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    shareMessage(title, description, whatsappUrl)
  )}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(facebookUrl)}`;
  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    description
      ? `${title} — ${description.length > 100 ? `${description.slice(0, 99).trimEnd()}…` : description}`
      : `Support ${title} on ${BRAND_NAME}`
  )}&url=${encodeURIComponent(twitterUrl)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const handleTikTok = async () => {
    const caption = shareMessage(title, description, tiktokUrl);
    try {
      await navigator.clipboard.writeText(caption);
      setTiktokHint(true);
      window.setTimeout(() => setTiktokHint(false), 4000);
    } catch {
      window.prompt('Copy this caption for TikTok:', caption);
    }
    window.open('https://www.tiktok.com/upload?lang=en', '_blank', 'noopener,noreferrer');
  };

  const btnBase =
    'flex items-center justify-center w-11 h-11 rounded-xl transition-colors text-white';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`Share ${title} on WhatsApp`}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebd5c] text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
          <MessageCircleIcon className="w-5 h-5" />
          WhatsApp
        </a>
        <a
          href={facebookHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`Share ${title} on Facebook`}
          className={`${btnBase} bg-[#1877F2] hover:bg-[#166fe5]`}>
          <FacebookIcon className="w-5 h-5" />
        </a>
        <a
          href={twitterHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`Share ${title} on X`}
          className={`${btnBase} bg-black hover:bg-surface-800`}>
          <TwitterIcon className="w-5 h-5" />
        </a>
        <button
          type="button"
          onClick={() => void handleTikTok()}
          aria-label={`Share ${title} on TikTok`}
          className={`${btnBase} bg-[#010101] hover:bg-surface-800 border border-white/10`}>
          <TikTokIcon className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Link copied' : `Copy link for ${title}`}
          className="flex items-center justify-center w-11 h-11 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-xl transition-colors">
          {copied ? <CheckIcon className="w-5 h-5 text-primary-600" /> : <LinkIcon className="w-5 h-5" />}
        </button>
      </div>
      {tiktokHint ? (
        <p className="text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
          Caption copied — paste it into your TikTok post.
        </p>
      ) : null}
    </div>
  );
}
