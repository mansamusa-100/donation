import { useEffect, useRef, useState } from 'react';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    }
  ) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (!gisScriptPromise) {
    gisScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisScriptPromise = null;
        reject(new Error('Could not load Google sign-in'));
      };
      document.head.appendChild(script);
    });
  }
  return gisScriptPromise;
}

interface GoogleSignInButtonProps {
  /** Called with the Google ID token when the user picks an account. */
  onCredential: (credential: string) => void;
  onError?: (message: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

/**
 * Renders the official "Sign in with Google" button (Google Identity Services).
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is not configured.
 */
export function GoogleSignInButton({ onCredential, onError, text = 'continue_with' }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!CLIENT_ID) {
      return;
    }
    let cancelled = false;

    void loadGisScript()
      .then(() => {
        if (cancelled) {
          return;
        }
        const gis = window.google?.accounts?.id;
        const parent = containerRef.current;
        if (!gis || !parent) {
          return;
        }
        gis.initialize({
          client_id: CLIENT_ID,
          callback: (response) => {
            if (response.credential) {
              onCredentialRef.current(response.credential);
            }
          }
        });
        parent.innerHTML = '';
        gis.renderButton(parent, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'pill',
          logo_alignment: 'left',
          width: Math.min(parent.offsetWidth || 360, 400)
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onErrorRef.current?.('Google sign-in could not load. Check your connection and try again.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!CLIENT_ID || failed) {
    return null;
  }

  return <div ref={containerRef} className="flex justify-center min-h-11" />;
}
