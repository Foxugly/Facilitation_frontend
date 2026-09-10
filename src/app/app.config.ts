import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import * as Sentry from '@sentry/angular';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { TranslocoHttpLoader } from './transloco-loader';
import { AVAILABLE_LANGS, DEFAULT_LANG } from './core/i18n/available-languages';
import { LanguageService } from './core/i18n/language.service';
import { ThemeService } from './core/theme/theme.service';
import { languageHeaderInterceptor } from './core/i18n/language.interceptor';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { StaleChunkService } from './core/app-update/stale-chunk.service';

// Aura preset with Emerald as primary; `green` primitive → emerald so `success`
// buttons match `primary` (one green across the UI, §3.15). Dark via `.dark-mode`.
const emeraldScale = {
  50: '{emerald.50}', 100: '{emerald.100}', 200: '{emerald.200}', 300: '{emerald.300}',
  400: '{emerald.400}', 500: '{emerald.500}', 600: '{emerald.600}', 700: '{emerald.700}',
  800: '{emerald.800}', 900: '{emerald.900}', 950: '{emerald.950}',
};
const AuraEmerald = definePreset(Aura, {
  primitive: { green: emeraldScale },
  semantic: { primary: emeraldScale },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: AuraEmerald, options: { darkModeSelector: '.dark-mode' } } }),
    provideHttpClient(withInterceptors([authInterceptor, languageHeaderInterceptor])),
    provideTransloco({
      config: {
        availableLangs: [...AVAILABLE_LANGS],
        defaultLang: DEFAULT_LANG,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      inject(ThemeService).init();
      inject(LanguageService).init();
      // Recovers tabs opened before a deploy, whose lazy chunks no longer exist.
      inject(StaleChunkService).init();
      // Restore any existing session before the app renders.
      return inject(AuthService).bootstrap();
    }),
    // Reports unhandled Angular errors to Sentry (no-op when Sentry.init wasn't
    // called, i.e. no DSN in dev). See main.ts.
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
    MessageService,
  ],
};
