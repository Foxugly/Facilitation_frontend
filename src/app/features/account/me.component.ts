import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';

import { AuthService } from '../../core/auth/auth.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

const AVATAR_COLORS = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#6366f1'];

/**
 * The signed-in user's account page: a profile header (avatar + name + email),
 * an editable display name, and the entry points to the account's things.
 */
@Component({
  selector: 'app-me',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslocoModule, ButtonModule, InputTextModule, TagModule, PageHeaderComponent],
  styleUrl: './account.scss',
  template: `
    <section class="page page--narrow">
      <app-page-header [icon]="'pi-user'" [title]="'me.title' | transloco" />

      @if (auth.currentUser(); as user) {
        <!-- Profile header -->
        <div class="profile">
          <div class="profile__avatar">
            @if (user.avatar_url) {
              <img [src]="user.avatar_url" alt="" />
            } @else {
              <span class="profile__initials" [style.background]="avatarColor(user.email)">{{ initials(user.display_name || user.email) }}</span>
            }
            <input #avatarFile type="file" accept="image/png,image/jpeg,image/webp" hidden (change)="onUploadAvatar(avatarFile)" />
            <button type="button" class="profile__avatar-btn" [attr.aria-label]="'me.avatar_change' | transloco"
                    [disabled]="uploadingAvatar()" (click)="avatarFile.click()">
              <i class="pi pi-camera"></i>
            </button>
          </div>
          <div class="profile__id">
            <div class="profile__name">{{ user.display_name || ('me.no_name' | transloco) }}</div>
            <div class="profile__email">
              <span class="mono">{{ user.email }}</span>
              @if (user.email_confirmed) {
                <p-tag severity="success" [value]="'me.email_confirmed' | transloco" />
              } @else {
                <p-tag severity="warn" [value]="'me.email_unconfirmed' | transloco" />
              }
              @if (user.is_staff) {
                <p-tag severity="info" [value]="'me.staff' | transloco" />
              }
            </div>
            @if (user.avatar_url) {
              <button type="button" class="link-btn" (click)="removeAvatar()">{{ 'me.avatar_remove' | transloco }}</button>
            }
            <p class="avatar-hint">{{ 'me.avatar_hint' | transloco }}</p>
          </div>
        </div>

        <!-- Display name -->
        <div class="section">
          <h3>{{ 'me.display_name' | transloco }}</h3>
          <p class="meta-hint">{{ 'me.display_name_hint' | transloco }}</p>
          <div class="row">
            <input pInputText [ngModel]="displayName()" (ngModelChange)="displayName.set($event)" style="min-width:240px" (keyup.enter)="save()" />
            <p-button [label]="'action.save' | transloco" icon="pi pi-save" [loading]="saving()" [disabled]="!dirty()" (onClick)="save()" />
          </div>
          <p class="meta-hint">{{ 'me.email_readonly' | transloco }}</p>
        </div>

        <!-- Account -->
        <div class="section">
          <h3>{{ 'me.account' | transloco }}</h3>
          <div class="row">
            <p-button [label]="'me.subscription_link' | transloco" icon="pi pi-credit-card"
                      [outlined]="true" severity="secondary" routerLink="/subscription" />
            <p-button [label]="'teams.title' | transloco" icon="pi pi-users"
                      [outlined]="true" severity="secondary" routerLink="/teams" />
          </div>
        </div>

        <div class="section">
          <p-button [label]="'auth.logout' | transloco" icon="pi pi-sign-out"
                    severity="danger" [outlined]="true" (onClick)="logout()" />
        </div>
      }
    </section>
  `,
})
export class MeComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);

  readonly displayName = signal(this.auth.currentUser()?.display_name ?? '');
  readonly saving = signal(false);
  readonly uploadingAvatar = signal(false);
  readonly dirty = computed(() => {
    const v = this.displayName().trim();
    return v.length > 0 && v !== (this.auth.currentUser()?.display_name ?? '');
  });

  async save(): Promise<void> {
    const name = this.displayName().trim();
    if (!name) return;
    this.saving.set(true);
    try {
      await this.auth.updateProfile(name);
      this.messages.add({ severity: 'success', summary: this.transloco.translate('me.saved') });
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    } finally {
      this.saving.set(false);
    }
  }

  async onUploadAvatar(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingAvatar.set(true);
    try {
      await this.auth.uploadAvatar(file);
      this.messages.add({ severity: 'success', summary: this.transloco.translate('me.avatar_saved') });
    } catch (e: unknown) {
      const detail = (e as { error?: { detail?: string; code?: string } }).error;
      const summary =
        detail?.code === 'invalid_image'
          ? detail.detail || this.transloco.translate('me.avatar_invalid')
          : this.transloco.translate('auth.errors.generic');
      this.messages.add({ severity: 'error', summary });
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  async removeAvatar(): Promise<void> {
    try {
      await this.auth.deleteAvatar();
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('auth.errors.generic') });
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/home']);
  }

  initials(name: string): string {
    const p = (name || '?').trim().split(/\s+/);
    return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[1][0] : (p[0]?.[1] ?? ''))).toUpperCase();
  }
  avatarColor(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
}
