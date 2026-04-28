import {
  MessageCircleIcon,
  FacebookIcon,
  TwitterIcon,
  LinkIcon } from
'lucide-react';
import { BRAND_NAME } from '../lib/brand';

interface ShareButtonsProps {
  url: string;
  title: string;
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const encodedUrl = encodeURIComponent(url);
  const shareText = encodeURIComponent(`Support ${title} on ${BRAND_NAME}`);
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `Support ${title} on ${BRAND_NAME}: ${url}`
  )}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const twitterHref = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  return (
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
        className="flex items-center justify-center w-11 h-11 bg-[#1877F2] hover:bg-[#166fe5] text-white rounded-xl transition-colors">
        <FacebookIcon className="w-5 h-5" />
      </a>
      <a
        href={twitterHref}
        target="_blank"
        rel="noreferrer"
        aria-label={`Share ${title} on Twitter`}
        className="flex items-center justify-center w-11 h-11 bg-black hover:bg-surface-800 text-white rounded-xl transition-colors">
        <TwitterIcon className="w-5 h-5" />
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy link for ${title}`}
        className="flex items-center justify-center w-11 h-11 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-xl transition-colors">
        <LinkIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
