import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { RoomApiService } from '../../core/api/room-api.service';
import { IdentityService } from '../../core/identity/identity.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, TranslocoModule, ButtonModule, InputTextModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private api = inject(RoomApiService);
  private identity = inject(IdentityService);
  private router = inject(Router);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);

  readonly username = signal(this.identity.username);
  readonly title = signal('');
  readonly creating = signal(false);

  readonly submitted = signal(false);

  // Join (inline on the home, both actions in evidence).
  readonly joinCode = signal('');
  readonly joinName = signal(this.identity.username);
  readonly joining = signal(false);
  readonly joinSubmitted = signal(false);

  /** Une salle sans compte ne choisit rien a la creation : elle porte tout le
   * catalogue gratuit, le facilitateur change de type de poker en salle, et le dos
   * des cartes est impose par le serveur. D'ou un formulaire reduit au titre et au
   * nom, et plus aucun appel au catalogue depuis cette page. */
  createRoom(): void {
    this.submitted.set(true);
    const name = this.username().trim();
    if (!name) return;
    this.identity.username = name;
    this.creating.set(true);
    this.api
      .createRoom(name, this.title().trim())
      .subscribe({
      next: (res) => {
        this.identity.saveSession({ code: res.code, token: res.participantToken, role: res.role });
        this.router.navigate(['/room', res.code]);
      },
      error: () => {
        this.creating.set(false);
        this.messages.add({ severity: 'error', summary: this.transloco.translate('errors.create_room') });
      },
    });
  }

  onJoinCode(value: string): void {
    this.joinCode.set(value.toUpperCase());
  }

  joinRoom(): void {
    this.joinSubmitted.set(true);
    const name = this.joinName().trim();
    const code = this.joinCode().trim().toUpperCase();
    if (!name || !code) return;
    this.identity.username = name;
    this.joining.set(true);
    this.api.joinRoom(code, name).subscribe({
      next: (res) => {
        this.identity.saveSession({ code: res.code, token: res.participantToken, role: res.role });
        this.router.navigate(['/room', res.code]);
      },
      error: (err) => {
        this.joining.set(false);
        const key = err?.error?.code === 'room_full' ? 'errors.room_full' : 'errors.room_not_found';
        this.messages.add({ severity: 'error', summary: this.transloco.translate(key) });
      },
    });
  }
}
