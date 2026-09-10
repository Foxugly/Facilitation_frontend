import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TabsModule } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';

import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { RoomApiService } from '../../core/api/room-api.service';
import { IdentityService } from '../../core/identity/identity.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TeamsService } from '../../core/teams/teams.service';
import { Background, BackgroundStyle, CardBack, Deck, Felt, Invitation, Membership, ResultLayout, SurfaceStyle, Team, TeamRole } from '../../core/teams/teams.models';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

const AVATAR_COLORS = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#6366f1'];

// Les couleurs d'usine des deux surfaces : elles doivent rester alignees sur les
// defauts du modele Team cote serveur, que le bouton de reset rend a l'identique.
const DEFAULT_FELT_COLOR = '#10b981';
const DEFAULT_BACK_COLOR = '#143d2f';
const DEFAULT_BACKGROUND_COLOR = '#0f172a';

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [FormsModule, TranslocoModule, ButtonModule, InputTextModule, SelectModule, SelectButtonModule, TabsModule, TagModule, TooltipModule, PageHeaderComponent],
  styleUrl: './teams.scss',
  template: `
    @if (team(); as team) {
      <section class="page">
        <app-page-header [icon]="'pi-users'" [title]="editingName() ? '' : team.name">
          <p-button slot="left" [label]="'action.back' | transloco" icon="pi pi-arrow-left" [text]="true" severity="secondary" (onClick)="back()" />
          <!-- Static slot element (projection doesn't reach a slot node placed directly
               inside @if); the rename toggle lives inside it. -->
          <span slot="title-after" class="name-slot">
            @if (isManager()) {
              @if (editingName()) {
                <span class="name-edit">
                  <input pInputText [(ngModel)]="renameValue" (keyup.enter)="confirmRename()" (keyup.escape)="cancelRename()" autofocus />
                  <p-button icon="pi pi-save" severity="success" [ariaLabel]="'action.save' | transloco" [loading]="savingName()" (onClick)="confirmRename()" />
                  <p-button icon="pi pi-times" [outlined]="true" severity="secondary" [ariaLabel]="'action.cancel' | transloco" (onClick)="cancelRename()" />
                </span>
              } @else {
                <button type="button" class="name-edit-btn" [attr.aria-label]="'teams.rename_action' | transloco" (click)="startEditName(team.name)"><i class="pi pi-pencil"></i></button>
              }
            }
          </span>
          <p-button slot="right" icon="pi pi-th-large" [outlined]="true" severity="secondary"
                    [pTooltip]="'board.title' | transloco" tooltipPosition="bottom" [ariaLabel]="'board.title' | transloco" (onClick)="openBoard()" />
          <p-button slot="right" icon="pi pi-history" [outlined]="true" severity="secondary"
                    [pTooltip]="'history.title' | transloco" tooltipPosition="bottom" [ariaLabel]="'history.title' | transloco" (onClick)="openHistory()" />
          <p-button slot="right" icon="pi pi-play" severity="success" [loading]="starting()"
                    [pTooltip]="'teams.new_session' | transloco" tooltipPosition="bottom" [ariaLabel]="'teams.new_session' | transloco" (onClick)="startSession()" />
        </app-page-header>

        <p-tabs [(value)]="activeTab">
          <p-tablist>
            <p-tab value="members"><span class="pi pi-users tab-icon"></span><span>{{ 'teams.tab_members' | transloco }}</span></p-tab>
            @if (isManager()) {
              <p-tab value="appearance"><span class="pi pi-palette tab-icon"></span><span>{{ 'teams.appearance' | transloco }}</span></p-tab>
              <p-tab value="deck"><span class="pi pi-clone tab-icon"></span><span>{{ 'teams.deck.tab' | transloco }}</span></p-tab>
            }
            @if (isOwner()) {
              <p-tab value="manage"><span class="pi pi-trash tab-icon"></span><span>{{ 'teams.delete' | transloco }}</span></p-tab>
            }
          </p-tablist>

          <p-tabpanels>
            <p-tabpanel value="members">
              <!-- Members -->
              <div class="section">
                @for (m of members(); track m.id) {
                  <div class="member-row">
                    @if (m.user.avatar_url) {
                      <img class="avatar avatar--img" [src]="m.user.avatar_url" alt="" />
                    } @else {
                      <div class="avatar" [style.background]="color(m.user.email)">{{ initials(m.user.display_name || m.user.email) }}</div>
                    }
                    <div class="who">
                      <div class="name">{{ m.user.display_name || m.user.email }}</div>
                      <div class="email">{{ m.user.email }}</div>
                    </div>
                    @if (m.role === 'owner') {
                      <p-tag [value]="'teams.role.owner' | transloco" />
                    } @else if (isManager()) {
                      <p-select [options]="roleOptions()" optionLabel="label" optionValue="value" [ngModel]="m.role" (ngModelChange)="setRole(m, $event)" appendTo="body" />
                      <p-button icon="pi pi-times" [text]="true" severity="danger" [ariaLabel]="'teams.remove' | transloco" (onClick)="remove(m)" />
                    } @else {
                      <p-tag [value]="'teams.role.' + m.role | transloco" severity="secondary" />
                    }
                  </div>
                }
              </div>

              <!-- Invitations (managers only) -->
              @if (isManager()) {
                <div class="section">
                  <h3>{{ 'teams.invitations' | transloco }}</h3>
                  <div class="invite-row">
                    <input pInputText [placeholder]="'auth.email' | transloco" [(ngModel)]="inviteEmail" style="min-width:220px" />
                    <p-select [options]="roleOptions()" optionLabel="label" optionValue="value" [(ngModel)]="inviteRole" appendTo="body" />
                    <p-button [label]="'teams.invite' | transloco" icon="pi pi-send" [loading]="inviting()" (onClick)="invite()" />
                  </div>
                  @for (inv of invitations(); track inv.id) {
                    <div class="pending">
                      <span>{{ inv.email }} · {{ 'teams.role.' + inv.role | transloco }}</span>
                      <p-button icon="pi pi-times" [text]="true" severity="secondary" [ariaLabel]="'teams.revoke' | transloco" (onClick)="revoke(inv)" />
                    </div>
                  }
                </div>
              }
            </p-tabpanel>

            <!-- Appearance (manager) — P2.6 -->
            @if (isManager()) {
              <p-tabpanel value="appearance">
                <div class="appearance-layout">
                  <!-- Left 66%: the two surface sub-tabs -->
                  <div class="appearance-main">
                    <p-tabs [(value)]="appearanceTab">
                      <p-tablist>
                        <p-tab value="table"><span class="pi pi-table tab-icon"></span><span>{{ 'teams.surface.table' | transloco }}</span></p-tab>
                        <p-tab value="back"><span class="pi pi-id-card tab-icon"></span><span>{{ 'teams.deck.backs_title' | transloco }}</span></p-tab>
                        <p-tab value="background"><span class="pi pi-image tab-icon"></span><span>{{ 'teams.background.tab' | transloco }}</span></p-tab>
                        <p-tab value="result"><span class="pi pi-chart-bar tab-icon"></span><span>{{ 'teams.result_layout.tab' | transloco }}</span></p-tab>
                      </p-tablist>

                      <p-tabpanels>
                        <!-- Table decoration = the felt -->
                        <p-tabpanel value="table">
                          <div class="section">
                            <div class="style-row">
                              <p-selectbutton [options]="styleOptions()" optionLabel="label" optionValue="value"
                                              [ngModel]="feltStyle()" (ngModelChange)="setStyle('felt', $event)" [allowEmpty]="false" />
                              <p-button icon="pi pi-eraser" [outlined]="true" severity="secondary" [rounded]="true"
                                        [pTooltip]="'teams.surface.reset' | transloco" tooltipPosition="left"
                                        [ariaLabel]="'teams.surface.reset' | transloco"
                                        [disabled]="!canResetFelt()" [loading]="savingFelt()" (onClick)="resetSurface('felt')" />
                            </div>
                            @if (feltStyle() === 'color') {
                              <div class="appearance-row">
                                <label>
                                  <span>{{ 'teams.felt_color' | transloco }}</span>
                                  <input type="color" [value]="feltColor()"
                                         (input)="feltColor.set($any($event.target).value)" (change)="saveAppearance()" />
                                </label>
                              </div>
                            } @else {
                              @if (canCustomize()) {
                                <div class="upload-row">
                                  <input #feltFile type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onUploadFelt(feltFile)" />
                                  <p-button [label]="'teams.surface.upload' | transloco" icon="pi pi-upload" [outlined]="true" [loading]="uploadingFelt()" (onClick)="feltFile.click()" />
                                  <span class="muted">{{ 'teams.surface.upload_hint' | transloco }}</span>
                                </div>
                              }
                              @if (decksLoading()) {
                                <p class="muted">{{ 'teams.deck.loading' | transloco }}</p>
                              } @else if (!felts().length) {
                                <p class="muted">{{ 'teams.surface.no_felt' | transloco }}</p>
                              } @else {
                                <div class="deck-grid">
                                  @for (f of felts(); track f.id) {
                                    <div class="deck-card-wrap">
                                      <button type="button" class="deck-card"
                                              [class.deck-card--selected]="f.id === selectedFeltId()"
                                              [disabled]="savingFelt()" (click)="selectFelt(f)">
                                        <span class="deck-card__cards">
                                          <span class="deck-card__mini deck-card__mini--felt"
                                                [style.background-image]="f.image ? 'url(' + f.image + ')' : null"></span>
                                          @if (f.id === selectedFeltId()) {
                                            <span class="deck-card__check" [attr.aria-label]="'teams.deck.in_use' | transloco"><i class="pi pi-check"></i></span>
                                          }
                                        </span>
                                        <span class="deck-card__name">{{ f.name }}</span>
                                        @if (f.is_custom) {
                                          <span class="deck-card__meta">{{ 'teams.deck.custom' | transloco }}</span>
                                        }
                                      </button>
                                      @if (f.image) {
                                        <button type="button" class="deck-card__zoom" [attr.aria-label]="'teams.surface.zoom' | transloco" (click)="zoom(f.image, $event)"><i class="pi pi-search-plus"></i></button>
                                      }
                                      @if (f.is_custom) {
                                        <button type="button" class="deck-card__delete" [attr.aria-label]="'teams.surface.delete' | transloco" (click)="deleteFelt(f, $event)"><i class="pi pi-trash"></i></button>
                                      }
                                    </div>
                                  }
                                </div>
                              }
                            }
                          </div>
                        </p-tabpanel>

                        <!-- Card backs -->
                        <p-tabpanel value="back">
                          <div class="section">
                            <div class="style-row">
                              <p-selectbutton [options]="styleOptions()" optionLabel="label" optionValue="value"
                                              [ngModel]="cardBackStyle()" (ngModelChange)="setStyle('card_back', $event)" [allowEmpty]="false" />
                              <p-button icon="pi pi-eraser" [outlined]="true" severity="secondary" [rounded]="true"
                                        [pTooltip]="'teams.surface.reset' | transloco" tooltipPosition="left"
                                        [ariaLabel]="'teams.surface.reset' | transloco"
                                        [disabled]="!canResetBack()" [loading]="savingBack()" (onClick)="resetSurface('card_back')" />
                            </div>
                            @if (cardBackStyle() === 'color') {
                              <div class="appearance-row">
                                <label>
                                  <span>{{ 'teams.back_color' | transloco }}</span>
                                  <input type="color" [value]="backColor()"
                                         (input)="backColor.set($any($event.target).value)" (change)="saveAppearance()" />
                                </label>
                              </div>
                            } @else {
                              @if (canCustomize()) {
                                <div class="upload-row">
                                  <input #backFile type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onUploadBack(backFile)" />
                                  <p-button [label]="'teams.surface.upload' | transloco" icon="pi pi-upload" [outlined]="true" [loading]="uploadingBack()" (onClick)="backFile.click()" />
                                  <span class="muted">{{ 'teams.surface.upload_hint' | transloco }}</span>
                                </div>
                              }
                              @if (decksLoading()) {
                                <p class="muted">{{ 'teams.deck.loading' | transloco }}</p>
                              } @else if (!cardBacks().length) {
                                <p class="muted">{{ 'teams.surface.no_back' | transloco }}</p>
                              } @else {
                                <div class="deck-grid">
                                  @for (back of cardBacks(); track back.id) {
                                    <div class="deck-card-wrap">
                                      <button type="button" class="deck-card"
                                              [class.deck-card--selected]="back.id === selectedCardBackId()"
                                              [disabled]="savingBack()" (click)="selectCardBack(back)">
                                        <span class="deck-card__cards">
                                          <span class="deck-card__mini deck-card__mini--back"
                                                [style.background-image]="back.image ? 'url(' + back.image + ')' : null"></span>
                                          @if (back.id === selectedCardBackId()) {
                                            <span class="deck-card__check" [attr.aria-label]="'teams.deck.in_use' | transloco"><i class="pi pi-check"></i></span>
                                          }
                                        </span>
                                        <span class="deck-card__name">{{ back.name }}</span>
                                        @if (back.is_custom) {
                                          <span class="deck-card__meta">{{ 'teams.deck.custom' | transloco }}</span>
                                        }
                                      </button>
                                      @if (back.image) {
                                        <button type="button" class="deck-card__zoom" [attr.aria-label]="'teams.surface.zoom' | transloco" (click)="zoom(back.image, $event)"><i class="pi pi-search-plus"></i></button>
                                      }
                                      @if (back.is_custom) {
                                        <button type="button" class="deck-card__delete" [attr.aria-label]="'teams.surface.delete' | transloco" (click)="deleteBack(back, $event)"><i class="pi pi-trash"></i></button>
                                      }
                                    </div>
                                  }
                                </div>
                              }
                            }
                          </div>
                        </p-tabpanel>

                        <!-- Le fond de la page de salle, derriere la table. Seule
                             surface a porter un mode « Theme », ou l'equipe
                             n'impose rien et la salle suit le clair/sombre. -->
                        <p-tabpanel value="background">
                          <div class="section">
                            <div class="style-row">
                              <p-selectbutton [options]="backgroundStyleOptions()" optionLabel="label" optionValue="value"
                                              [ngModel]="backgroundStyle()" (ngModelChange)="setBackgroundStyle($event)" [allowEmpty]="false" />
                              <p-button icon="pi pi-eraser" [outlined]="true" severity="secondary" [rounded]="true"
                                        [pTooltip]="'teams.surface.reset' | transloco" tooltipPosition="left"
                                        [ariaLabel]="'teams.surface.reset' | transloco"
                                        [disabled]="!canResetBackground()" [loading]="savingBackground()" (onClick)="resetBackground()" />
                            </div>
                            @if (backgroundStyle() === 'theme') {
                              <p class="muted">{{ 'teams.background.theme_hint' | transloco }}</p>
                            } @else if (backgroundStyle() === 'color') {
                              <div class="appearance-row">
                                <label>
                                  <span>{{ 'teams.background.color' | transloco }}</span>
                                  <input type="color" [value]="backgroundColor()"
                                         (input)="backgroundColor.set($any($event.target).value)" (change)="saveAppearance()" />
                                </label>
                              </div>
                            } @else {
                              @if (canCustomize()) {
                                <div class="upload-row">
                                  <input #bgFile type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onUploadBackground(bgFile)" />
                                  <p-button [label]="'teams.surface.upload' | transloco" icon="pi pi-upload" [outlined]="true" [loading]="uploadingBackground()" (onClick)="bgFile.click()" />
                                  <span class="muted">{{ 'teams.background.upload_hint' | transloco }}</span>
                                </div>
                              }
                              @if (decksLoading()) {
                                <p class="muted">{{ 'teams.deck.loading' | transloco }}</p>
                              } @else if (!backgrounds().length) {
                                <p class="muted">{{ 'teams.background.none' | transloco }}</p>
                              } @else {
                                <div class="deck-grid">
                                  @for (bg of backgrounds(); track bg.id) {
                                    <div class="deck-card-wrap">
                                      <button type="button" class="deck-card"
                                              [class.deck-card--selected]="bg.id === selectedBackgroundId()"
                                              [disabled]="savingBackground()" (click)="selectBackground(bg)">
                                        <span class="deck-card__cards">
                                          <span class="deck-card__mini deck-card__mini--bg"
                                                [style.background-image]="bg.image ? 'url(' + bg.image + ')' : null"></span>
                                          @if (bg.id === selectedBackgroundId()) {
                                            <span class="deck-card__check" [attr.aria-label]="'teams.deck.in_use' | transloco"><i class="pi pi-check"></i></span>
                                          }
                                        </span>
                                        <span class="deck-card__name">{{ bg.name }}</span>
                                        @if (bg.is_custom) {
                                          <span class="deck-card__meta">{{ 'teams.deck.custom' | transloco }}</span>
                                        }
                                      </button>
                                      @if (bg.image) {
                                        <button type="button" class="deck-card__zoom" [attr.aria-label]="'teams.surface.zoom' | transloco" (click)="zoom(bg.image, $event)"><i class="pi pi-search-plus"></i></button>
                                      }
                                      @if (bg.is_custom) {
                                        <button type="button" class="deck-card__delete" [attr.aria-label]="'teams.surface.delete' | transloco" (click)="deleteBackground(bg, $event)"><i class="pi pi-trash"></i></button>
                                      }
                                    </div>
                                  }
                                </div>
                              }
                            }
                          </div>
                        </p-tabpanel>

                        <!-- Ce que les joueurs voient a la place de leur main, une
                             fois les votes reveles. -->
                        <p-tabpanel value="result">
                          <div class="section">
                            <p class="deck-intro">{{ 'teams.result_layout.intro' | transloco }}</p>
                            <div class="deck-grid">
                              @for (choice of resultLayoutChoices(); track choice.value) {
                                <button type="button" class="deck-card layout-card"
                                        [class.deck-card--selected]="resultLayout() === choice.value"
                                        [attr.aria-pressed]="resultLayout() === choice.value"
                                        [disabled]="savingResultLayout()" (click)="selectResultLayout(choice.value)">
                                  <span class="deck-card__cards">
                                    <!-- Schema, pas une capture : il doit rester juste
                                         quel que soit le jeu de cartes de l'equipe. -->
                                    @if (choice.value === 'cards') {
                                      <span class="layout-mini layout-mini--card"></span>
                                      <span class="layout-mini layout-mini--card"></span>
                                      <span class="layout-mini layout-mini--card"></span>
                                    } @else {
                                      <span class="layout-rows">
                                        <span class="layout-bar" style="width:100%"></span>
                                        <span class="layout-bar" style="width:60%"></span>
                                        <span class="layout-bar" style="width:35%"></span>
                                      </span>
                                    }
                                    @if (resultLayout() === choice.value) {
                                      <span class="deck-card__check" [attr.aria-label]="'teams.deck.in_use' | transloco"><i class="pi pi-check"></i></span>
                                    }
                                  </span>
                                  <span class="deck-card__name">{{ choice.label }}</span>
                                  <span class="deck-card__meta">{{ choice.hint }}</span>
                                </button>
                              }
                            </div>
                          </div>
                        </p-tabpanel>
                      </p-tabpanels>
                    </p-tabs>
                  </div>

                  <!-- Right 33%: the currently selected layout, as the room will draw it.
                       Absent du sous-onglet Depouillement : cet apercu montre le tapis et
                       le dos des cartes, dont ce reglage ne decide rien — les vignettes
                       des deux choix font office d'apercu. -->
                  @if (appearanceTab !== 'result') {
                    <fieldset class="appearance-preview">
                      <legend>{{ 'teams.surface.preview' | transloco }}</legend>
                      <!-- Le fond se peint derriere la table, comme dans la salle.
                           En mode Theme il ne pose rien et l'apercu garde le sien. -->
                      <span class="preview-stage" [style.background-color]="backgroundPreviewColor()"
                            [style.background-image]="backgroundPreviewImage()">
                        <span class="table-preview table-preview--lg" [style.--table-felt]="feltColor()" [style.--table-felt-image]="feltPreviewImage()">
                          <span class="card-preview" [style.background-color]="backColor()" [style.background-image]="backPreviewImage()"></span>
                        </span>
                      </span>
                    </fieldset>
                  }
                </div>

                @if (zoomImage(); as img) {
                  <div class="zoom-overlay" (click)="closeZoom()">
                    <img [src]="img" alt="" />
                  </div>
                }
              </p-tabpanel>
            }

            <!-- Poker type / deck (manager) -->
            @if (isManager()) {
              <p-tabpanel value="deck">
                <div class="section">
                  <p class="deck-intro">{{ 'teams.deck.intro' | transloco }}</p>

                  @if (decksLoading()) {
                    <p class="muted">{{ 'teams.deck.loading' | transloco }}</p>
                  } @else {
                    <div class="deck-grid">
                      @for (deck of decks(); track deck.id) {
                        <button
                          type="button"
                          class="deck-card"
                          [class.deck-card--selected]="isEnabled(deck.id)"
                          [attr.aria-pressed]="isEnabled(deck.id)"
                          [disabled]="savingDeck()"
                          (click)="toggleDeck(deck)"
                        >
                          <span class="deck-card__cards">
                            @for (card of deck.cards.slice(0, 5); track card.slug) {
                              <span class="deck-card__mini" [style.background-image]="card.image ? 'url(' + card.image + ')' : null">
                                {{ card.value }}
                              </span>
                            }
                            @if (isEnabled(deck.id)) {
                              <span class="deck-card__check" [attr.aria-label]="'teams.deck.enabled' | transloco"><i class="pi pi-check"></i></span>
                            }
                          </span>
                          <span class="deck-card__name">{{ deck.name }}</span>
                          <span class="deck-card__meta">
                            {{ deck.vote_type_name }}
                            @if (deck.is_custom) {
                              · {{ 'teams.deck.custom' | transloco }}
                            }
                          </span>
                        </button>
                      }
                    </div>

                    @if (!enabledDeckIds().length) {
                      <p class="muted">{{ 'teams.deck.none_enabled' | transloco }}</p>
                    }

                    <div class="deck-create">
                      <p-button
                        [label]="'teams.deck.create' | transloco"
                        icon="pi pi-plus"
                        [outlined]="true"
                        [disabled]="true"
                      />
                      <span class="muted">
                        {{ (canCustomize() ? 'teams.deck.create_soon' : 'teams.deck.create_paid') | transloco }}
                      </span>
                    </div>
                  }
                </div>
              </p-tabpanel>
            }

            <!-- Delete (owner). Rename lives in the header. -->
            @if (isOwner()) {
              <p-tabpanel value="manage">
                <div class="section">
                  <p class="deck-intro">{{ 'teams.delete_intro' | transloco }}</p>
                  <p-button [label]="'teams.delete' | transloco" icon="pi pi-trash" severity="danger" [outlined]="true" (onClick)="remove_team()" />
                </div>
              </p-tabpanel>
            }
          </p-tabpanels>
        </p-tabs>
      </section>
    }
  `,
})
export class TeamDetailComponent implements OnInit {
  private teamsService = inject(TeamsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);
  private language = inject(LanguageService);
  private auth = inject(AuthService);
  private roomApi = inject(RoomApiService);
  private identity = inject(IdentityService);

  private id = 0;
  activeTab = 'members';
  appearanceTab = 'table';
  readonly starting = signal(false);
  readonly team = signal<Team | null>(null);
  readonly members = signal<Membership[]>([]);
  readonly invitations = signal<Invitation[]>([]);
  readonly isManager = computed(() => ['owner', 'manager'].includes(this.team()?.my_role ?? ''));
  readonly isOwner = computed(() => this.team()?.my_role === 'owner');
  readonly inviting = signal(false);
  inviteEmail = '';
  inviteRole: TeamRole = 'member';
  renameValue = '';
  readonly editingName = signal(false);
  readonly savingName = signal(false);

  // Appearance (P2.6)
  readonly feltColor = signal(DEFAULT_FELT_COLOR);
  readonly backColor = signal(DEFAULT_BACK_COLOR);
  readonly savingAppearance = signal(false);
  readonly zoomImage = signal<string | null>(null);

  // Poker type / deck (P2.8)
  readonly decks = signal<Deck[]>([]);
  readonly enabledDeckIds = signal<number[]>([]);
  readonly cardBacks = signal<CardBack[]>([]);
  readonly selectedCardBackId = signal<number | null>(null);
  readonly canCustomize = signal(false);
  readonly decksLoading = signal(true);
  readonly savingDeck = signal(false);
  readonly savingBack = signal(false);

  // Appearance styles: each surface renders either a flat colour or a catalogue
  // image. The unpicked one is kept, so switching back and forth loses nothing.
  readonly felts = signal<Felt[]>([]);
  readonly selectedFeltId = signal<number | null>(null);
  readonly feltStyle = signal<SurfaceStyle>('color');
  readonly cardBackStyle = signal<SurfaceStyle>('color');
  readonly savingFelt = signal(false);
  readonly uploadingBack = signal(false);
  readonly uploadingFelt = signal(false);

  // Depouillement : ce qui remplace la main des la revelation. Les salles deja
  // ouvertes gardent la leur, le serveur la figeant a la creation.
  readonly resultLayout = signal<ResultLayout>('cards');
  readonly savingResultLayout = signal(false);
  readonly resultLayoutChoices = computed(() => {
    this.language.revision();
    return (['cards', 'summary'] as ResultLayout[]).map((value) => ({
      value,
      label: this.transloco.translate(`teams.result_layout.${value}`),
      hint: this.transloco.translate(`teams.result_layout.${value}_hint`),
    }));
  });
  readonly styleOptions = computed(() => {
    this.language.revision();
    return [
      { value: 'color' as SurfaceStyle, label: this.transloco.translate('teams.surface.style_color') },
      { value: 'image' as SurfaceStyle, label: this.transloco.translate('teams.surface.style_image') },
    ];
  });
  readonly feltPreviewImage = computed(() => {
    const f = this.felts().find((x) => x.id === this.selectedFeltId());
    return this.feltStyle() === 'image' && f?.image ? `url(${f.image})` : null;
  });
  readonly backPreviewImage = computed(() => {
    const b = this.cardBacks().find((x) => x.id === this.selectedCardBackId());
    return this.cardBackStyle() === 'image' && b?.image ? `url(${b.image})` : null;
  });

  // Fond de la page de salle. Le mode 'theme' ne peint rien : l'apercu comme la
  // salle gardent alors la couleur du theme courant.
  readonly backgrounds = signal<Background[]>([]);
  readonly selectedBackgroundId = signal<number | null>(null);
  readonly backgroundStyle = signal<BackgroundStyle>('theme');
  readonly backgroundColor = signal(DEFAULT_BACKGROUND_COLOR);
  readonly savingBackground = signal(false);
  readonly uploadingBackground = signal(false);
  readonly backgroundStyleOptions = computed(() => {
    this.language.revision();
    return [
      { value: 'theme' as BackgroundStyle, label: this.transloco.translate('teams.background.style_theme') },
      { value: 'color' as BackgroundStyle, label: this.transloco.translate('teams.surface.style_color') },
      { value: 'image' as BackgroundStyle, label: this.transloco.translate('teams.surface.style_image') },
    ];
  });
  readonly backgroundPreviewColor = computed(() =>
    this.backgroundStyle() === 'theme' ? null : this.backgroundColor(),
  );
  readonly backgroundPreviewImage = computed(() => {
    const b = this.backgrounds().find((x) => x.id === this.selectedBackgroundId());
    return this.backgroundStyle() === 'image' && b?.image ? `url(${b.image})` : null;
  });
  // Rien a rendre quand le fond est deja a l'etat d'usine, mode par mode.
  readonly canResetBackground = computed(() => {
    switch (this.backgroundStyle()) {
      case 'theme':
        return false;
      case 'color':
        return this.backgroundColor().toLowerCase() !== DEFAULT_BACKGROUND_COLOR;
      default:
        return this.selectedBackgroundId() !== null;
    }
  });

  // Etat d'usine du mode Image : aucun tapis choisi cote table, et le premier dos
  // livre cote cartes — le meme repli que loadDecks applique a une equipe neuve.
  readonly defaultCardBackId = computed(() => this.cardBacks().find((b) => b.is_standard)?.id ?? null);
  // Le reset ne porte que sur le mode affiche, donc il n'a rien a faire quand ce
  // mode-la est deja d'usine ; le bouton reste alors eteint.
  readonly canResetFelt = computed(() =>
    this.feltStyle() === 'color'
      ? this.feltColor().toLowerCase() !== DEFAULT_FELT_COLOR
      : this.selectedFeltId() !== null,
  );
  readonly canResetBack = computed(() =>
    this.cardBackStyle() === 'color'
      ? this.backColor().toLowerCase() !== DEFAULT_BACK_COLOR
      : this.selectedCardBackId() !== this.defaultCardBackId(),
  );


  // Computed, not a field initialiser: translate() at construction runs before the
  // catalogue is loaded and bakes in the raw key — which is what the role selects
  // were actually displaying. Reading the language revision re-labels both on a
  // switch and once the catalogue lands; a computed alone would keep the raw key.
  readonly roleOptions = computed(() => {
    this.language.revision();
    return [
      { value: 'member', label: this.transloco.translate('teams.role.member') },
      { value: 'manager', label: this.transloco.translate('teams.role.manager') },
    ];
  });

  async ngOnInit(): Promise<void> {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    try {
      const team = await this.teamsService.getTeam(this.id);
      this.team.set(team);
      this.renameValue = team.name;
      this.feltColor.set(team.felt_color);
      this.backColor.set(team.card_back_color);
      this.feltStyle.set(team.felt_style);
      this.cardBackStyle.set(team.card_back_style);
      this.backgroundStyle.set(team.background_style);
      this.backgroundColor.set(team.background_color);
      this.resultLayout.set(team.result_layout ?? 'cards');
      this.members.set(await this.teamsService.getMembers(this.id));
      if (this.isManager()) {
        this.invitations.set(await this.teamsService.getInvitations(this.id));
        await this.loadDecks();
      }
    } catch {
      this.router.navigate(['/teams']);
    }
  }

  private async loadDecks(): Promise<void> {
    this.decksLoading.set(true);
    try {
      const res = await this.teamsService.getDecks(this.id);
      this.decks.set(res.decks);
      this.cardBacks.set(res.card_backs);
      this.felts.set(res.felts);
      this.selectedFeltId.set(res.selected_felt_id);
      this.backgrounds.set(res.backgrounds);
      this.selectedBackgroundId.set(res.selected_background_id);
      this.canCustomize.set(res.can_customize);
      // A team that never picked plays the standard deck/back — show those as in use.
      this.enabledDeckIds.set(res.selected_deck_ids);
      this.selectedCardBackId.set(
        res.selected_card_back_id ?? res.card_backs.find((b) => b.is_standard)?.id ?? null,
      );
    } finally {
      this.decksLoading.set(false);
    }
  }

  async setStyle(surface: 'felt' | 'card_back', style: SurfaceStyle): Promise<void> {
    const target = surface === 'felt' ? this.feltStyle : this.cardBackStyle;
    const previous = target();
    if (style === previous) return;
    target.set(style);
    try {
      const team = await this.teamsService.setSurfaceStyle(this.id, surface, style);
      this.team.set(team);
    } catch {
      target.set(previous);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  // Rend au sous-onglet courant son etat d'usine, mais seulement dans le mode
  // affiche : en Couleur la couleur par defaut, en Image l'absence de choix. Le
  // style Couleur/Image lui-meme n'est jamais touche, et le mode non affiche
  // garde ce que l'equipe y avait mis.
  async resetSurface(surface: 'felt' | 'card_back'): Promise<void> {
    const saving = surface === 'felt' ? this.savingFelt : this.savingBack;
    if (saving()) return;
    const reset = this.applyDefault(surface);
    saving.set(true);
    try {
      this.team.set(await reset.request());
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.appearance_saved') });
    } catch {
      reset.revert();
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      saving.set(false);
    }
  }

  // Pose l'etat d'usine tout de suite et rend de quoi appeler le serveur puis, si
  // l'appel echoue, revenir a la valeur precedente.
  private applyDefault(surface: 'felt' | 'card_back'): { request: () => Promise<Team>; revert: () => void } {
    if (surface === 'felt') {
      if (this.feltStyle() === 'color') {
        const previous = this.feltColor();
        this.feltColor.set(DEFAULT_FELT_COLOR);
        return {
          request: () => this.teamsService.setAppearance(this.id, { felt_color: DEFAULT_FELT_COLOR }),
          revert: () => this.feltColor.set(previous),
        };
      }
      const previous = this.selectedFeltId();
      this.selectedFeltId.set(null);
      return {
        request: () => this.teamsService.setFelt(this.id, null),
        revert: () => this.selectedFeltId.set(previous),
      };
    }
    if (this.cardBackStyle() === 'color') {
      const previous = this.backColor();
      this.backColor.set(DEFAULT_BACK_COLOR);
      return {
        request: () => this.teamsService.setAppearance(this.id, { card_back_color: DEFAULT_BACK_COLOR }),
        revert: () => this.backColor.set(previous),
      };
    }
    // null cote serveur = pas de dos choisi ; l'ecran affiche alors le dos livre,
    // exactement ce que la salle dessinera.
    const previous = this.selectedCardBackId();
    this.selectedCardBackId.set(this.defaultCardBackId());
    return {
      request: () => this.teamsService.setCardBack(this.id, null),
      revert: () => this.selectedCardBackId.set(previous),
    };
  }

  // Setter propre au fond : son style admet 'theme', que setStyle ne connait pas.
  async setBackgroundStyle(style: BackgroundStyle): Promise<void> {
    const previous = this.backgroundStyle();
    if (style === previous) return;
    this.backgroundStyle.set(style);
    try {
      this.team.set(await this.teamsService.setBackgroundStyle(this.id, style));
    } catch {
      this.backgroundStyle.set(previous);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  async selectBackground(background: Background): Promise<void> {
    if (background.id === this.selectedBackgroundId()) return;
    const previous = this.selectedBackgroundId();
    this.selectedBackgroundId.set(background.id);
    this.savingBackground.set(true);
    try {
      this.team.set(await this.teamsService.setBackground(this.id, background.id));
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.appearance_saved') });
    } catch {
      this.selectedBackgroundId.set(previous);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingBackground.set(false);
    }
  }

  async onUploadBackground(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingBackground.set(true);
    try {
      const background = await this.teamsService.uploadBackground(this.nameFromFile(file), file);
      await this.loadDecks();
      await this.selectBackground(background);
    } catch (e: unknown) {
      this.uploadError(e);
    } finally {
      this.uploadingBackground.set(false);
    }
  }

  async deleteBackground(background: Background, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(this.transloco.translate('teams.surface.delete_confirm'))) return;
    try {
      await this.teamsService.deleteBackground(background.id);
      if (background.id === this.selectedBackgroundId()) this.selectedBackgroundId.set(null);
      await this.loadDecks();
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  /** Comme les deux autres surfaces : ne remet a l'usine que le mode affiche. En
   *  mode Theme il n'y a rien a rendre, le bouton y est donc toujours eteint. */
  async resetBackground(): Promise<void> {
    if (this.savingBackground()) return;
    const byColour = this.backgroundStyle() === 'color';
    const previousColor = this.backgroundColor();
    const previousId = this.selectedBackgroundId();
    if (byColour) this.backgroundColor.set(DEFAULT_BACKGROUND_COLOR);
    else this.selectedBackgroundId.set(null);
    this.savingBackground.set(true);
    try {
      this.team.set(
        byColour
          ? await this.teamsService.setAppearance(this.id, { background_color: DEFAULT_BACKGROUND_COLOR })
          : await this.teamsService.setBackground(this.id, null),
      );
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.appearance_saved') });
    } catch {
      if (byColour) this.backgroundColor.set(previousColor);
      else this.selectedBackgroundId.set(previousId);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingBackground.set(false);
    }
  }

  async selectResultLayout(layout: ResultLayout): Promise<void> {
    const previous = this.resultLayout();
    if (layout === previous) return;
    this.resultLayout.set(layout);
    this.savingResultLayout.set(true);
    try {
      this.team.set(await this.teamsService.setResultLayout(this.id, layout));
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.appearance_saved') });
    } catch {
      this.resultLayout.set(previous);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingResultLayout.set(false);
    }
  }

  async selectFelt(felt: Felt): Promise<void> {
    if (felt.id === this.selectedFeltId()) return;
    const previous = this.selectedFeltId();
    this.selectedFeltId.set(felt.id);
    this.savingFelt.set(true);
    try {
      const team = await this.teamsService.setFelt(this.id, felt.id);
      this.team.set(team);
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.appearance_saved') });
    } catch {
      this.selectedFeltId.set(previous);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingFelt.set(false);
    }
  }

  private nameFromFile(file: File): string {
    return file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Image';
  }

  async onUploadBack(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingBack.set(true);
    try {
      const back = await this.teamsService.uploadCardBack(this.nameFromFile(file), file);
      await this.loadDecks();
      await this.selectCardBack(back);
    } catch (e: unknown) {
      this.uploadError(e);
    } finally {
      this.uploadingBack.set(false);
    }
  }

  async onUploadFelt(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingFelt.set(true);
    try {
      const felt = await this.teamsService.uploadFelt(this.nameFromFile(file), file);
      await this.loadDecks();
      await this.selectFelt(felt);
    } catch (e: unknown) {
      this.uploadError(e);
    } finally {
      this.uploadingFelt.set(false);
    }
  }

  async deleteBack(back: CardBack, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(this.transloco.translate('teams.surface.delete_confirm'))) return;
    try {
      await this.teamsService.deleteCardBack(back.id);
      await this.loadDecks();
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  async deleteFelt(felt: Felt, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(this.transloco.translate('teams.surface.delete_confirm'))) return;
    try {
      await this.teamsService.deleteFelt(felt.id);
      await this.loadDecks();
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  /** The backend rejects bad images with a specific message — surface it. */
  private uploadError(e: unknown): void {
    const detail = (e as { error?: { detail?: string; code?: string } }).error;
    const summary =
      detail?.code === 'invalid_image'
        ? detail.detail || this.transloco.translate('teams.surface.upload_invalid')
        : this.transloco.translate('auth.errors.generic');
    this.messages.add({ severity: 'error', summary });
  }

  async selectCardBack(back: CardBack): Promise<void> {
    // Picking a model means "use this back", so switch to the image style if the
    // team was on a flat colour — otherwise the pick would be saved but not shown.
    const wasColour = this.cardBackStyle() === 'color';
    if (back.id === this.selectedCardBackId() && !wasColour) return;
    const previous = this.selectedCardBackId();
    this.selectedCardBackId.set(back.id);
    this.savingBack.set(true);
    try {
      if (wasColour) await this.setStyle('card_back', 'image');
      const team = await this.teamsService.setCardBack(this.id, back.id);
      this.team.set(team);
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.deck.back_saved') });
    } catch {
      this.selectedCardBackId.set(previous);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingBack.set(false);
    }
  }

  isEnabled(deckId: number): boolean {
    return this.enabledDeckIds().includes(deckId);
  }

  async toggleDeck(deck: Deck): Promise<void> {
    const previous = this.enabledDeckIds();
    const next = this.isEnabled(deck.id)
      ? previous.filter((id) => id !== deck.id)
      : [...previous, deck.id];
    this.enabledDeckIds.set(next);
    this.savingDeck.set(true);
    try {
      const team = await this.teamsService.setDecks(this.id, next);
      this.team.set(team);
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.deck.saved') });
    } catch {
      this.enabledDeckIds.set(previous);
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingDeck.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/teams']);
  }

  openHistory(): void {
    this.router.navigate(['/teams', this.team()?.id, 'history']);
  }

  openBoard(): void {
    this.router.navigate(['/teams', this.team()?.id, 'board']);
  }

  async saveAppearance(): Promise<void> {
    this.savingAppearance.set(true);
    try {
      const team = await this.teamsService.setAppearance(this.id, {
        felt_color: this.feltColor(),
        card_back_color: this.backColor(),
        background_color: this.backgroundColor(),
      });
      this.team.set(team);
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.appearance_saved') });
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingAppearance.set(false);
    }
  }

  async startSession(): Promise<void> {
    this.starting.set(true);
    try {
      const res = await firstValueFrom(this.roomApi.createRoom('', '', this.id));
      this.identity.saveSession({ code: res.code, token: res.participantToken, role: res.role });
      this.router.navigate(['/room', res.code]);
    } finally {
      this.starting.set(false);
    }
  }

  async setRole(m: Membership, role: TeamRole): Promise<void> {
    await this.teamsService.changeRole(this.id, m.user.id, role);
    this.members.update((list) => list.map((x) => (x.id === m.id ? { ...x, role } : x)));
  }

  async remove(m: Membership): Promise<void> {
    await this.teamsService.removeMember(this.id, m.user.id);
    this.members.update((list) => list.filter((x) => x.id !== m.id));
  }

  async invite(): Promise<void> {
    const email = this.inviteEmail.trim().toLowerCase();
    if (!email) return;
    this.inviting.set(true);
    try {
      const inv = await this.teamsService.invite(this.id, email, this.inviteRole);
      this.invitations.update((list) => [...list, inv]);
      this.inviteEmail = '';
      this.messages.add({ severity: 'success', summary: this.transloco.translate('teams.invited') });
    } catch (e: unknown) {
      const code = (e as { error?: { code?: string } }).error?.code;
      this.messages.add({ severity: 'warn', summary: this.transloco.translate(code === 'already_member' ? 'teams.already_member' : 'auth.errors.generic') });
    } finally {
      this.inviting.set(false);
    }
  }

  async revoke(inv: Invitation): Promise<void> {
    await this.teamsService.revokeInvite(this.id, inv.id);
    this.invitations.update((list) => list.filter((x) => x.id !== inv.id));
  }

  startEditName(current: string): void {
    this.renameValue = current;
    this.editingName.set(true);
  }

  cancelRename(): void {
    this.editingName.set(false);
  }

  async confirmRename(): Promise<void> {
    const name = this.renameValue.trim();
    if (!name) return;
    this.savingName.set(true);
    try {
      const team = await this.teamsService.renameTeam(this.id, name);
      this.team.set(team);
      this.editingName.set(false);
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.savingName.set(false);
    }
  }

  zoom(image: string, event: Event): void {
    event.stopPropagation();
    this.zoomImage.set(image);
  }

  closeZoom(): void {
    this.zoomImage.set(null);
  }

  async remove_team(): Promise<void> {
    if (!confirm(this.transloco.translate('teams.delete_confirm'))) return;
    await this.teamsService.deleteTeam(this.id);
    this.router.navigate(['/teams']);
  }

  initials(name: string): string {
    const p = (name || '?').trim().split(/\s+/);
    return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[1][0] : p[0]?.[1] ?? '')).toUpperCase();
  }
  color(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
}
