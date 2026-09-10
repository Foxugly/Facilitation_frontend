import { Component, computed, DestroyRef, effect, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import QRCode from 'qrcode';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { RoomApiService } from '../../core/api/room-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { IdentityService } from '../../core/identity/identity.service';
import { secondsLeft } from '../../core/realtime/countdown';
import { RoomSocketService } from '../../core/realtime/room-socket.service';
import { joinUrl } from '../../core/rooms/join-url';
import { RoundState, SnapshotCard } from '../../core/realtime/protocol';
import { DelegationCardComponent } from '../../shared/ui/delegation-card/delegation-card.component';
import { NgComponentOutlet } from '@angular/common';
import { resolveActivity } from './activities/activity-registry';
import { DelegationDeckComponent } from '../../shared/ui/delegation-deck/delegation-deck.component';

const BADGE_SEVERITY: Record<RoundState, 'secondary' | 'success' | 'warn' | 'info'> = {
  idle: 'secondary',
  open: 'success',
  revealed: 'warn',
  acted: 'info',
};

/** Admissible round-timer durations (contract §timer): 10-60s, step 5 — a discrete
 * picker so the UI can never compose an off-grid value (the server normalises anyway). */
const TIMER_DURATIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

/** Angles (from the top, clockwise) for `n` seats spaced by equal ARC LENGTH on an
 * ellipse of radii (rx, ry). Equal angle steps would crowd the wide sides; equal
 * arc keeps neighbours a uniform distance apart so their cards never overlap. */


@Component({
  selector: 'app-room',
  standalone: true,
  imports: [
    FormsModule, TranslocoModule, ButtonModule, InputNumberModule, InputTextModule, SelectModule, TagModule, ToggleSwitchModule,
    TooltipModule, DelegationDeckComponent, DelegationCardComponent,
    NgComponentOutlet,
  ],
  templateUrl: './room.component.html',
  styleUrl: './room.component.scss',
})
export class RoomComponent implements OnInit, OnDestroy {
  readonly socket = inject(RoomSocketService);
  private identity = inject(IdentityService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private language = inject(LanguageService);
  private transloco = inject(TranslocoService);
  private roomApi = inject(RoomApiService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('roomEl') private roomEl?: ElementRef<HTMLElement>;
  readonly code = signal('');
  readonly isFullscreen = signal(false);
  /** Data URL du QR de jointure ; non nul = la fenetre est ouverte. */
  readonly qrDataUrl = signal<string | null>(null);
  readonly lang = this.language.active;

  private countdownHandle: ReturnType<typeof setInterval> | null = null;


  readonly isFacilitator = computed(() => this.socket.myRole() === 'facilitator');

  /** Y a-t-il un panneau lateral a afficher ?
   *
   * Deux cas : on facilite, ou personne ne facilite et n'importe qui peut reprendre
   * le role. Cette condition pilote A LA FOIS le rendu du panneau et la grille a deux
   * colonnes — les deux avaient diverge (la grille ne regardait que `isFacilitator`),
   * si bien que l'encart « Prendre le role » s'affichait en pleine largeur sous la
   * table au lieu de la carte de droite. */
  readonly showPanel = computed(() => this.isFacilitator() || !this.socket.facilitatorPresent());
  // Team appearance (P2.6): felt recolours the table, card-back colours the face-down cards.
  // Appearance: each surface says whether it renders a colour or an image. The
  // legacy theme.* is the fallback while older snapshots are still around.
  readonly feltColor = computed(
    () => this.socket.deckSnapshot()?.felt?.color ?? this.socket.deckSnapshot()?.theme?.feltColor ?? null,
  );
  readonly feltImage = computed(() => {
    const felt = this.socket.deckSnapshot()?.felt;
    return felt?.style === 'image' && felt.image ? `url(${felt.image})` : null;
  });
  /** Fond de la page, derriere la table. Null en mode 'theme' — et pour les salles
   *  ouvertes avant la fonctionnalite, dont le snapshot fige n'a pas le champ : la
   *  page garde alors le fond du theme, ce qu'elle faisait deja. */
  readonly backgroundColor = computed(() => {
    const bg = this.socket.deckSnapshot()?.background;
    return bg && bg.style !== 'theme' ? bg.color : null;
  });
  readonly backgroundImage = computed(() => {
    const bg = this.socket.deckSnapshot()?.background;
    return bg?.style === 'image' && bg.image ? `url(${bg.image})` : null;
  });
  /** Un fond quelconque casse le contraste du texte pose dessus : l'equipe choisit
   *  son image, pas la couleur d'encre du visiteur. Quand il y en a un, les zones
   *  de texte prennent un voile de la surface courante. */
  /** L'activite jouee, resolue par le registre depuis le `voteType` du deck.
   * La salle ne nomme plus aucune activite : ajouter la suivante ne touchera que
   * `activities/activity-registry.ts`. */
  readonly activity = computed(() => resolveActivity(this.socket.deckSnapshot()?.voteType));

  readonly hasCustomBackground = computed(() => this.backgroundColor() !== null || this.backgroundImage() !== null);


  constructor() {
    // Surface server rejections / connection errors as toasts (pattern flotte).
    effect(() => {
      const err = this.socket.lastError();
      if (err) this.messages.add({ severity: 'warn', summary: err.code, detail: err.message });
    });
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  private stopCountdown(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }











  async ngOnInit(): Promise<void> {
    document.addEventListener('fullscreenchange', this.onFsChange);
    const code = (this.route.snapshot.paramMap.get('code') ?? '').toUpperCase();
    this.code.set(code);
    const session = this.identity.sessionFor(code);
    if (session) {
      this.socket.connect(session.code, session.token, session.role);
      return;
    }
    // No local session: resolve the room. A team room auto-joins an authenticated
    // member (no username prompt); an anonymous room goes through /join.
    try {
      const info = await firstValueFrom(this.roomApi.roomExists(code));
      if (!info.exists) return this.router.navigate(['/join', code]) as unknown as void;
      if (info.isTeam) {
        if (!this.auth.isAuthenticated()) {
          this.router.navigate(['/login'], { queryParams: { returnUrl: `/room/${code}` } });
          return;
        }
        const res = await firstValueFrom(this.roomApi.joinRoom(code, ''));
        this.identity.saveSession({ code: res.code, token: res.participantToken, role: res.role });
        this.socket.connect(res.code, res.participantToken, res.role);
      } else {
        this.router.navigate(['/join', code]);
      }
    } catch {
      this.router.navigate(['/join', code]);
    }
  }


  private readonly onFsChange = () => this.isFullscreen.set(!!document.fullscreenElement);

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      // Fullscreen the room only (no top menu / footer) so nothing scrolls.
      else await this.roomEl?.nativeElement.requestFullscreen();
    } catch {
      /* fullscreen may be blocked; ignore */
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onFsChange);
    this.socket.disconnect();
  }



  copyCode(): void {
    navigator.clipboard?.writeText(this.code());
    this.messages.add({ severity: 'success', summary: this.transloco.translate('room.code_copied') });
  }

  shareLink(): void {
    navigator.clipboard?.writeText(this.joinUrl());
    this.messages.add({ severity: 'success', summary: this.transloco.translate('room.link_copied') });
  }

  private joinUrl(): string {
    return joinUrl(location.origin, this.code());
  }

  async openQr(): Promise<void> {
    try {
      // Data URL plutot qu'un canvas : la CSP autorise img-src data:, et une image
      // se re-encode en blob pour le presse-papier sans dependre du DOM rendu.
      this.qrDataUrl.set(await QRCode.toDataURL(this.joinUrl(), { width: 320, margin: 2 }));
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  closeQr(): void {
    this.qrDataUrl.set(null);
  }

  /** Copie l'image du QR. Le presse-papier *image* n'est pas universel (Firefox
   *  en tete) : quand il refuse, on copie le lien, qui rend le meme service. */
  async copyQr(): Promise<void> {
    const src = this.qrDataUrl();
    if (!src) return;
    try {
      const blob = await (await fetch(src)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      this.messages.add({ severity: 'success', summary: this.transloco.translate('room.qr.copied') });
    } catch {
      navigator.clipboard?.writeText(this.joinUrl());
      this.messages.add({ severity: 'success', summary: this.transloco.translate('room.link_copied') });
    }
  }

  quit(): void {
    this.socket.disconnect();
    this.router.navigate(['/']);
  }

}
