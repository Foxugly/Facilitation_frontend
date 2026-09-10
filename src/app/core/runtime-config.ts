// Runtime config: prod values injected by nginx into index.html as window.__FACILITATION__
// (from SSM /facilitation-frontend/prod/*, see deploy/nginx/facilitation-frontend.conf +
// deploy/fetch-frontend-runtime-from-ssm.sh). Dev (ng serve) has no global and
// falls back to the local backend. 100% PUBLIC — never put a secret here.
export interface RuntimeSentry {
  dsn: string;
  environment: string;
  release: string;
}

export interface RuntimeConfig {
  apiBaseUrl: string;
  wsBaseUrl: string;
  turnstileSiteKey: string;
  sentry: RuntimeSentry;
}

declare global {
  interface Window {
    __FACILITATION__?: {
      apiBaseUrl?: string;
      wsBaseUrl?: string;
      turnstileSiteKey?: string;
      sentry?: Partial<RuntimeSentry>;
    };
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  const injected = (typeof window !== 'undefined' && window.__FACILITATION__) || {};
  const apiBaseUrl = (injected.apiBaseUrl ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  // WS base is derived from the API base (http→ws) unless explicitly provided.
  const wsBaseUrl = (injected.wsBaseUrl ?? apiBaseUrl.replace(/^http/, 'ws')).replace(/\/$/, '');
  const s = injected.sentry ?? {};
  return {
    apiBaseUrl,
    wsBaseUrl,
    turnstileSiteKey: (injected.turnstileSiteKey ?? '').trim(),
    sentry: {
      dsn: (s.dsn ?? '').trim(),
      environment: (s.environment ?? 'production').trim(),
      release: (s.release ?? '').trim(),
    },
  };
}
