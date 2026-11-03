'use client';

import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      remove?: (widgetId: string) => void;
    };
  }
}

export interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  actionLabel?: string;
}

const BUILD_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';

export function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  }, [onVerify, onExpire]);

  const [siteKey, setSiteKey] = React.useState<string>(BUILD_SITE_KEY);
  const [widgetError, setWidgetError] = React.useState<string | null>(null);

  useEffect(() => {
    if (BUILD_SITE_KEY) {
      return;
    }
    let active = true;
    async function loadRuntimeSiteKey() {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { turnstileSiteKey?: string };
        };
        if (active && body?.ok && body.data?.turnstileSiteKey) {
          setSiteKey(body.data.turnstileSiteKey.trim());
        }
      } catch {
        // Ignore runtime discovery failure
      }
    }
    void loadRuntimeSiteKey();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      return;
    }

    let cancelled = false;
    setWidgetError(null);

    function mountTurnstile() {
      if (cancelled || !containerRef.current || !window.turnstile) {
        return;
      }
      if (widgetIdRef.current && window.turnstile.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          callback: (token: string) => {
            setWidgetError(null);
            onVerifyRef.current(token);
          },
          'expired-callback': () => {
            onVerifyRef.current('');
            onExpireRef.current?.();
          },
          'error-callback': () => {
            onVerifyRef.current('');
            onExpireRef.current?.();
            setWidgetError(
              'Security challenge could not load. Check that getcustomcare.xyz is added to your Cloudflare Turnstile widget domains or disable ad/script blockers.'
            );
          },
        });
      } catch {
        setWidgetError('Unable to initialize Cloudflare Turnstile challenge.');
      }
    }

    if (window.turnstile) {
      mountTurnstile();
    } else {
      const existingScript = document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', mountTurnstile);
      } else {
        const script = document.createElement('script');
        script.id = 'cf-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = mountTurnstile;
        script.onerror = () => {
          if (!cancelled) {
            setWidgetError(
              'Cloudflare Turnstile script was blocked by your browser (e.g. Brave Shields or an ad blocker). Please allow challenges.cloudflare.com.'
            );
          }
        };
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="pt-2 space-y-1.5">
      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200/80 p-1.5 overflow-hidden" />
      {widgetError && (
        <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          {widgetError}
        </p>
      )}
    </div>
  );
}
