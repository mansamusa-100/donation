import { useState } from 'react';
import { MessageCircleIcon, FacebookIcon, TwitterIcon, LinkIcon, CheckIcon } from 'lucide-react';
import { BRAND_NAME } from '../lib/brand';

interface ShareButtonsProps {
  url: string;
  title: string;
  /** Short campaign blurb used in WhatsApp / X share text. */
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

export function ShareButtons({ url, title, description }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const whatsappUrl = withUtm(url, 'whatsapp');
  const facebookUrl = withUtm(url, 'facebook');
  const twitterUrl = withUtm(url, 'twitter');

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

  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={whatsappHref}
        target="_blank"
        rel="noreferrer"
        aria-label={`Share ${title} on WhatsApp`}
        className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebd5c] text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
      >
        <MessageCircleIcon className="w-5 h-5" />
        WhatsApp
      </a>
      <a
        href={facebookHref}
        target="_blank"
        rel="noreferrer"
        aria-label={`Share ${title} on Facebook`}
        className="flex items-center justify-center w-11 h-11 bg-[#1877F2] hover:bg-[#166fe5] text-white rounded-xl transition-colors"
      >
        <FacebookIcon className="w-5 h-5" />
      </a>
      <a
        href={twitterHref}
        target="_blank"
        rel="noreferrer"
        aria-label={`Share ${title} on X`}
        className="flex items-center justify-center w-11 h-11 bg-black hover:bg-surface-800 text-white rounded-xl transition-colors"
      >
        <TwitterIcon className="w-5 h-5" />
      </a>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? 'Link copied' : `Copy link for ${title}`}
        className="flex items-center justify-center w-11 h-11 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-xl transition-colors"
      >
        {copied ? <CheckIcon className="w-5 h-5 text-primary-600" /> : <LinkIcon className="w-5 h-5" />}
      </button>
    </div>
  );
}
