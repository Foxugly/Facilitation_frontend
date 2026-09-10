import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { RoomApiService } from '../../core/api/room-api.service';
import { IdentityService } from '../../core/identity/identity.service';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [FormsModule, TranslocoModule, ButtonModule, InputTextModule],
  templateUrl: './join.component.html',
})
export class JoinComponent implements OnInit {
  private api = inject(RoomApiService);
  private identity = inject(IdentityService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);

  readonly code = signal('');
  readonly username = signal(this.identity.username);
  readonly fromUrl = signal(false);
  readonly joining = signal(false);
  readonly submitted = signal(false);

  ngOnInit(): void {
    // Arrival by direct URL /join/:code — skip the code field.
    const urlCode = this.route.snapshot.paramMap.get('code');
    if (urlCode) {
      this.code.set(urlCode.toUpperCase());
      this.fromUrl.set(true);
    }
  }

  join(): void {
    this.submitted.set(true);
    const name = this.username().trim();
    const code = this.code().trim().toUpperCase();
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

  cancel(): void {
    this.router.navigate(['/']);
  }

  onCode(value: string): void {
    this.code.set(value.toUpperCase());
  }
}
