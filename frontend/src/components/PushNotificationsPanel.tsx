import { useCallback, useEffect, useState } from 'react';
import { BellIcon, BellOffIcon, CheckCircle2Icon } from 'lucide-react';
import { api } from '../lib/api';
import {
  getBrowserPushSubscription,
  getReadyServiceWorker,
  isPushSupported,
  urlBase64ToUint8Array
} from '../lib/push';
import { toUserFriendlyError } from '../lib/userFriendlyError';
import { BRAND_NAME } from '../lib/brand';

type UiState = 'loading' | 'unsupported' | 'unconfigured' | 'off' | 'on' | 'denied';

export function PushNotificationsPanel() {
  const [state, setState] = useState<UiState>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [deviceCount, setDeviceCount] = useState(0);

  const refresh = useCallback(async () => {
    setMessage('');
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    try {
      const status = await api.getPushStatus();
      setDeviceCount(status.deviceCount);
      if (!status.configured) {
        setState('unconfigured');
        return;
      }

      const sub = await getBrowserPushSubscription();
      setState(sub ? 'on' : 'off');
    } catch (err) {
      const msg = toUserFriendlyError(err);
      if (/not configured/i.test(msg)) {
        setState('unconfigured');
        return;
      }
      setMessage(msg);
      setState('off');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { publicKey } = await api.getVapidPublicKey();
      const reg = await getReadyServiceWorker();
      if (!reg) {
        throw new Error('App install / service worker is not ready yet. Refresh and try again.');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
        });
      }

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Could not create a push subscription on this device.');
      }

      await api.subscribePush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent
      });

      setState('on');
      setMessage('Donation alerts are on for this device.');
      await refresh();
    } catch (err) {
      setMessage(toUserFriendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const sub = await getBrowserPushSubscription();
      if (sub) {
        await api.unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
      setMessage('Donation alerts turned off on this device.');
      await refresh();
    } catch (err) {
      setMessage(toUserFriendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-surface-200">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          {state === 'on' ? <BellIcon className="h-5 w-5" /> : <BellOffIcon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-surface-900 text-lg">Donation alerts</h2>
          <p className="mt-1 text-sm text-surface-600">
            Get a phone notification when someone donates to your campaign — even if {BRAND_NAME} is closed.
          </p>

          {state === 'loading' && (
            <p className="mt-3 text-sm text-surface-500">Checking notification settings…</p>
          )}

          {state === 'unsupported' && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              This browser does not support push notifications. On iPhone, install {BRAND_NAME} to the home screen
              first, then open it from there.
            </p>
          )}

          {state === 'unconfigured' && (
            <p className="mt-3 text-sm text-surface-600">
              Push alerts are not available on this server yet. Ask an admin to set VAPID keys.
            </p>
          )}

          {state === 'denied' && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Notifications are blocked for this site. Enable them in your browser or phone settings, then refresh.
            </p>
          )}

          {(state === 'off' || state === 'on') && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {state === 'off' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enable()}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                  {busy ? 'Enabling…' : 'Turn on alerts'}
                </button>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                    <CheckCircle2Icon className="h-4 w-4" />
                    On{deviceCount > 1 ? ` · ${deviceCount} devices` : ''}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void disable()}
                    className="rounded-xl border border-surface-200 px-4 py-2 text-sm font-semibold text-surface-700 hover:bg-surface-50 disabled:opacity-60">
                    {busy ? 'Turning off…' : 'Turn off on this device'}
                  </button>
                </>
              )}
            </div>
          )}

          {message ? <p className="mt-3 text-sm text-surface-600">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
