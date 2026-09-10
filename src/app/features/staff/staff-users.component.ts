import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { bypassPatch } from '../../core/staff/bypass-patch';
import { StaffService } from '../../core/staff/staff.service';
import { StaffUser } from '../../core/staff/staff.models';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

/**
 * Back-office staff (§9 accès offert) : recherche de comptes et bascule du
 * flag `subscription_bypass`. Masqué par `superuserGuard` côté client ; la
 * vraie frontière de sécurité est `IsAdminUser` côté serveur (Task 4).
 */
@Component({
  selector: 'app-staff-users',
  standalone: true,
  imports: [
    FormsModule,
    TranslocoModule,
    ButtonModule,
    InputTextModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    PageHeaderComponent,
  ],
  template: `
    <section class="page">
      <app-page-header [icon]="'pi-shield'" [title]="'staff.users.title' | transloco" />

      <div class="staff-users__search">
        <input
          pInputText
          [(ngModel)]="query"
          [placeholder]="'staff.users.search_placeholder' | transloco"
          (keyup.enter)="search()"
        />
        <p-button
          [label]="'staff.users.search' | transloco"
          icon="pi pi-search"
          [loading]="loading()"
          (onClick)="search()"
        />
      </div>

      <p-table [value]="users()" [loading]="loading()">
        <ng-template pTemplate="header">
          <tr>
            <th>{{ 'staff.users.fields.email' | transloco }}</th>
            <th>{{ 'staff.users.fields.name' | transloco }}</th>
            <th>{{ 'staff.users.fields.bypass' | transloco }}</th>
            <th>{{ 'staff.users.fields.note' | transloco }}</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-user>
          <tr>
            <td>{{ user.email }}</td>
            <td>{{ user.display_name }}</td>
            <td>
              <p-toggleswitch
                [ngModel]="user.subscription_bypass"
                (ngModelChange)="toggle(user, $event)"
                [disabled]="busy() === user.id"
              />
              @if (user.subscription_bypass) {
                <p-tag severity="success" icon="pi pi-gift" [value]="'billing.offered_access' | transloco" />
              }
            </td>
            <td>
              <input
                pInputText
                class="staff-users__note"
                [ngModel]="noteFor(user.id)"
                (ngModelChange)="setNote(user.id, $event)"
                [placeholder]="'staff.users.fields.note_placeholder' | transloco"
              />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="4" class="staff-users__empty">—</td>
          </tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .staff-users__search { display: flex; gap: var(--s-2); margin-bottom: var(--s-4); }
      .staff-users__note { width: 100%; min-width: 12rem; }
      .staff-users__empty { text-align: center; padding-block: var(--s-4); color: var(--muted); }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffUsersComponent {
  private readonly staff = inject(StaffService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected query = '';
  protected readonly users = signal<StaffUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal<number | null>(null);
  // Motif en cours d'édition, indexé par id (jamais par position dans la
  // liste) : préremplie depuis la note serveur à chaque recherche, pour
  // qu'une bascule sans saisie renvoie la note existante au lieu de l'écraser.
  protected readonly notes = signal<Record<number, string>>({});

  protected search(): void {
    this.loading.set(true);
    this.staff.search(this.query).subscribe({
      next: (users) => {
        this.users.set(users);
        this.notes.set(Object.fromEntries(users.map((u) => [u.id, u.bypass_note ?? ''])));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('staff.users.errors.load_failed'),
        });
      },
    });
  }

  protected noteFor(id: number): string {
    return this.notes()[id] ?? '';
  }

  protected setNote(id: number, value: string): void {
    this.notes.update((byId) => ({ ...byId, [id]: value }));
  }

  protected toggle(user: StaffUser, next: boolean): void {
    this.busy.set(user.id);
    const { subscription_bypass, bypass_note } = bypassPatch(next, this.noteFor(user.id));
    this.staff.setBypass(user.id, subscription_bypass, bypass_note).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
        this.notes.update((byId) => ({ ...byId, [updated.id]: updated.bypass_note ?? '' }));
        this.busy.set(null);
        this.messages.add({
          severity: 'success',
          summary: this.transloco.translate('staff.users.actions.saved'),
        });
      },
      error: () => {
        this.busy.set(null);
        this.messages.add({
          severity: 'error',
          summary: this.transloco.translate('staff.users.errors.save_failed'),
        });
      },
    });
  }
}
