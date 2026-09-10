import { Injectable, inject } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Wording differs per browser and per bundler, so match on all of them rather
 * than on one engine's phrasing:
 * Chromium "Failed to fetch dynamically imported module",
 * Firefox "error loading dynamically imported module",
 * Safari "Importing a module script failed",
 * webpack-era "Loading chunk 42 failed" / ChunkLoadError.
 */
const STALE_CHUNK_SIGNATURES =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk \S+ failed|chunkloaderror/i;

/** Exported for testing: the browser-wording matching is the fragile part. */
export function isStaleChunkError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String((error as { message?: string })?.message ?? error);
  return STALE_CHUNK_SIGNATURES.test(text);
}

/**
 * Recovers from a lazy chunk that no longer exists on the server.
 *
 * The app is split into content-hashed chunks fetched on demand. A deploy
 * replaces them all with new names and deletes the old ones, so a tab opened
 * *before* the deploy asks for a filename that is gone as soon as the user
 * navigates to a route it had not visited yet. The browser reports:
 *
 *     Failed to fetch dynamically imported module: .../chunk-6EYZE7OG.js
 *
 * Seen in production on poker (POKER-FRONTEND-4) and tm (TM-FRONTEND-5).
 * A plain reload fixes it — the user just has no way of knowing that.
 *
 * Two cases, deliberately handled differently:
 *
 * - **During a navigation.** The destination is known and nothing is half
 *   rendered, so we reload straight to it. The user asked for that page and
 *   gets it, one beat later, instead of a dead click.
 * - **Anywhere else.** Reloading could throw away what the user was doing, so
 *   we only offer it, via a sticky toast.
 */
@Injectable({ providedIn: 'root' })
export class StaleChunkService {
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  /** Guards against a reload loop when the chunk is missing for another reason. */
  private static readonly RELOAD_MARKER = 'poker.staleChunkReloadAt';
  private static readonly RELOAD_COOLDOWN_MS = 30_000;

  init(): void {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationError && isStaleChunkError(event.error)) {
        this.recover(event.url);
      }
    });

    // Dynamic imports fired outside the router (a lazily loaded dialog, say)
    // surface as an unhandled rejection instead of a NavigationError.
    window.addEventListener('unhandledrejection', (event) => {
      if (isStaleChunkError(event.reason)) {
        this.offerReload();
      }
    });
  }

  private recover(url: string): void {
    if (this.reloadedRecently()) {
      // We already reloaded and the chunk is still missing, so a second reload
      // would just loop. Something else is wrong — tell the user instead.
      this.offerReload();
      return;
    }
    this.markReloaded();
    window.location.assign(url);
  }

  private offerReload(): void {
    this.messages.add({
      severity: 'warn',
      sticky: true,
      closable: true,
      summary: this.transloco.translate('appUpdate.title'),
      detail: this.transloco.translate('appUpdate.detail'),
    });
  }

  private reloadedRecently(): boolean {
    try {
      const at = Number(sessionStorage.getItem(StaleChunkService.RELOAD_MARKER) ?? 0);
      return Date.now() - at < StaleChunkService.RELOAD_COOLDOWN_MS;
    } catch {
      // Private mode / storage disabled: better to reload than to loop silently.
      return false;
    }
  }

  private markReloaded(): void {
    try {
      sessionStorage.setItem(StaleChunkService.RELOAD_MARKER, String(Date.now()));
    } catch {
      /* storage unavailable — the cooldown simply does not apply */
    }
  }
}
