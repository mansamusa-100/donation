import { useState } from 'react';
import { MessageCircleIcon, FacebookIcon, TwitterIcon, LinkIcon, CheckIcon, XIcon } from 'lucide-react';
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

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

function isMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Try app deep links, then fall back to a web / store URL. */
function openTikTokApp(kind: 'full' | 'lite') {
  const storeOrWeb =
    kind === 'lite'
      ? 'https://play.google.com/store/apps/details?id=com.tiktok.lite.go'
      : 'https://www.tiktok.com/';

  if (isAndroid()) {
    // Full TikTok (global) + Lite Play Store package. Chrome opens the fallback if the app is missing.
    const pkg = kind === 'lite' ? 'com.tiktok.lite.go' : 'com.zhiliaoapp.musically';
    const fallbackEnc = encodeURIComponent(storeOrWeb);
    window.location.href = `intent://www.tiktok.com/#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${fallbackEnc};end`;
    return;
  }

  // iOS / other: custom schemes, then web/store if the app does not open.
  const scheme = kind === 'lite' ? 'snssdk2329://' : 'snssdk1233://';
  const started = Date.now();
  window.location.href = scheme;
  window.setTimeout(() => {
    if (Date.now() - started < 1600) {
      window.location.href = storeOrWeb;
    }
  }, 1200);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      window.prompt('Copy this caption for TikTok:', text);
      return true;
    } catch {
      return false;
    }
  }
}

export function ShareButtons({ url, title, description }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [tiktokOpen, setTiktokOpen] = useState(false);
  const [captionReady, setCaptionReady] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  const whatsappUrl = withUtm(url, 'whatsapp');
  const facebookUrl = withUtm(url, 'facebook');
  const twitterUrl = withUtm(url, 'twitter');
  const tiktokUrl = withUtm(url, 'tiktok');
  const caption = shareMessage(title, description, tiktokUrl);

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

  const prepareTikTokCaption = async () => {
    const ok = await copyText(caption);
    setCaptionReady(ok);
  };

  const openTikTokSheet = async () => {
    await prepareTikTokCaption();
    setTiktokOpen(true);

    // On mobile, also try the system share sheet immediately (includes TikTok + TikTok Lite).
    if (canNativeShare() && isMobile()) {
      setShareBusy(true);
      try {
        await navigator.share({
          title,
          text: caption,
          url: tiktokUrl
        });
      } catch {
        // User cancelled or share failed — sheet below still helps.
      } finally {
        setShareBusy(false);
      }
    }
  };

  const shareViaDevice = async () => {
    if (!canNativeShare()) {
      return;
    }
    setShareBusy(true);
    try {
      await prepareTikTokCaption();
      await navigator.share({
        title,
        text: caption,
        url: tiktokUrl
      });
    } catch {
      // cancelled
    } finally {
      setShareBusy(false);
    }
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
          onClick={() => void openTikTokSheet()}
          aria-label={`Share ${title} on TikTok`}
          aria-expanded={tiktokOpen}
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

      {tiktokOpen ? (
        <div
          className="rounded-2xl border border-surface-200 bg-surface-50 p-4 space-y-3"
          role="region"
          aria-label="Share on TikTok">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-surface-900 text-sm">Share on TikTok</p>
              <p className="text-xs text-surface-600 mt-1">
                {captionReady
                  ? 'Caption copied. Open your app and paste it into a new post.'
                  : 'Copy the caption, then open TikTok or TikTok Lite to paste it.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTiktokOpen(false)}
              className="rounded-lg p-1.5 text-surface-400 hover:bg-white hover:text-surface-700"
              aria-label="Close TikTok share options">
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            {canNativeShare() ? (
              <button
                type="button"
                disabled={shareBusy}
                onClick={() => void shareViaDevice()}
                className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                {shareBusy ? 'Opening…' : 'Share via phone…'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void prepareTikTokCaption();
                openTikTokApp('full');
              }}
              className="rounded-xl bg-[#010101] px-4 py-2.5 text-sm font-bold text-white hover:bg-surface-800">
              Open TikTok
            </button>
            <button
              type="button"
              onClick={() => {
                void prepareTikTokCaption();
                openTikTokApp('lite');
              }}
              className="rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm font-bold text-surface-800 hover:bg-surface-100">
              Open TikTok Lite
            </button>
            <button
              type="button"
              onClick={() => void prepareTikTokCaption()}
              className="rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-surface-700 hover:bg-surface-100">
              Copy caption again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
