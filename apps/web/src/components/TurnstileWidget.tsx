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
  const [siteKey, setSiteKey] = React.useState<string>(BUILD_SITE_KEY);

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
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        callback: (token: string) => {
          onVerify(token);
        },
        'expired-callback': () => {
          onVerify('');
          onExpire?.();
        },
        'error-callback': () => {
          onVerify('');
          onExpire?.();
        },
      });
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
      }
    };
  }, [siteKey, onVerify, onExpire]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="pt-2">
      <div ref={containerRef} className="min-h-[65px]" />
    </div>
  );
}
