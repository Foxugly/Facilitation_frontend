/**
 * Cloudflare Turnstile (captcha) helper.
 *
 * The public site key is resolved at runtime from getRuntimeConfig()
 * (window.__FACILITATION__.turnstileSiteKey, injected by nginx from SSM). When the key
 * is empty the captcha is not provisioned: the widget is not rendered and no
 * token is required (the backend is gated on its secret the same way).
 */
import { getRuntimeConfig } from '../../core/runtime-config';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: string) => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId?: string) => void;
      remove?: (widgetId: string) => void;
    };
  }
}

export const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * Inject the Turnstile API <script> once, on demand (audit 2026-10-18, F-M2).
 * It used to be loaded from index.html on every route (room, dashboard...),
 * giving a third-party script same-origin access to the stored tokens
 * everywhere; now only the forms that render the widget pull it in. Same
 * approach as PushIT_frontend. CSP: script-src allowlists
 * https://challenges.cloudflare.com, so a script element created by the
 * (same-origin) bundle needs no nonce.
 */
export function loadTurnstileScript(): void {
  if (typeof document === 'undefined' || window.turnstile) return;
  if (document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) return;
  const script = document.createElement('script');
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export class TurnstileController {
  readonly siteKey = getRuntimeConfig().turnstileSiteKey;
  readonly enabled = this.siteKey.length > 0;

  private widgetId: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  render(container: HTMLElement | undefined, attempts = 0): void {
    if (!this.enabled || typeof window === 'undefined') return;
    if (attempts === 0) loadTurnstileScript();
    if (!window.turnstile?.render) {
      if (attempts >= 20) return;
      this.retryTimer = setTimeout(() => this.render(container, attempts + 1), 500);
      return;
    }
    if (!container || this.widgetId !== null) return;
    this.widgetId = window.turnstile.render(container, { sitekey: this.siteKey });
  }

  readToken(): string {
    if (typeof document === 'undefined') return '';
    const input = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    return input?.value ?? '';
  }

  reset(): void {
    if (typeof window === 'undefined' || !window.turnstile?.reset) return;
    if (this.widgetId !== null) window.turnstile.reset(this.widgetId);
    else window.turnstile.reset();
  }

  destroy(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.widgetId !== null && window.turnstile?.remove) window.turnstile.remove(this.widgetId);
    this.widgetId = null;
  }
}
