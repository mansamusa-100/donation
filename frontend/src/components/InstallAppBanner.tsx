import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { BRAND_NAME, BRAND_NAME_PRIMARY } from '../lib/brand';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'barakahfund-install-dismissed';

/**
 * Soft install cue for mobile/desktop Chrome (beforeinstallprompt).
 * iOS Safari cannot use that API — we show a short “Add to Home Screen” hint instead.
 */
export function InstallAppBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }
    if (localStorage.getItem(DISMISS_KEY) === '1') {
      return;
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) {
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  const title = `Install ${BRAND_NAME_PRIMARY} Fund`;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-brand-200 bg-white shadow-lg shadow-brand-900/10 p-4"
      role="dialog"
      aria-label={title}>
      <div className="flex gap-3 items-start">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-surface-900">{title}</p>
          {iosHint ? (
            <p className="mt-1 text-sm text-surface-600">
              Tap <span className="font-semibold">Share</span>, then{' '}
              <span className="font-semibold">Add to Home Screen</span> to keep {BRAND_NAME} on your phone.
            </p>
          ) : (
            <p className="mt-1 text-sm text-surface-600">
              Add {BRAND_NAME} to your home screen for quicker giving and campaign updates.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!iosHint ? (
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
                Install app
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl border border-surface-200 px-4 py-2 text-sm font-semibold text-surface-700 hover:bg-surface-50">
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-surface-400 hover:bg-surface-100"
          aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
