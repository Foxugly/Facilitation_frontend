import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';

import { BoardsService } from '../../core/boards/boards.service';
import { Board, BoardLevel, BoardRow, Dimension } from '../../core/boards/boards.models';
import { LanguageService } from '../../core/i18n/language.service';
import { TeamsService } from '../../core/teams/teams.service';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { exportBoardCsv, exportBoardPdf } from './board-export';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [FormsModule, TranslocoModule, ButtonModule, InputTextModule, SelectButtonModule, PageHeaderComponent],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
})
export class BoardComponent implements OnInit {
  private boards = inject(BoardsService);
  private teams = inject(TeamsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private language = inject(LanguageService);
  private messages = inject(MessageService);
  private transloco = inject(TranslocoService);
  private readonly lang = this.language.active;

  readonly teamId = signal(0);
  readonly teamName = signal('');
  readonly levels = signal<BoardLevel[]>([]);
  readonly rows = signal<BoardRow[]>([]);
  readonly loading = signal(true);
  readonly isManager = signal(false);

  readonly mode = signal<Dimension>('asIs');
  readonly modeOptions = computed(() => [
    { label: this.transloco.translate('board.as_is'), value: 'asIs' as Dimension },
    { label: this.transloco.translate('board.to_be'), value: 'toBe' as Dimension },
  ]);

  readonly newTopic = signal('');
  readonly editingId = signal<number | null>(null);
  readonly editTopic = signal('');

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.teamId.set(id);
    try {
      const [board, team] = await Promise.all([this.boards.getBoard(id), this.teams.getTeam(id)]);
      this.applyBoard(board);
      this.teamName.set(team.name);
      this.isManager.set(team.my_role === 'owner' || team.my_role === 'manager');
    } finally {
      this.loading.set(false);
    }
  }

  private applyBoard(board: Board): void {
    this.levels.set(board.levels);
    this.rows.set(board.rows);
  }

  levelName(level: BoardLevel): string {
    const n = level.name;
    if (typeof n === 'string') return n;
    return n[this.lang()] ?? n['en'] ?? Object.values(n)[0] ?? level.value;
  }

  /** Place / move / clear the current-mode post-it for a row at a given level. */
  async place(row: BoardRow, level: BoardLevel): Promise<void> {
    if (!this.isManager()) return;
    const dim = this.mode();
    const current = dim === 'asIs' ? row.asIs : row.toBe;
    const next = current === level.value ? null : level.value;
    const patched = await this.boards.patchRow(this.teamId(), row.id, { [dim]: next });
    this.rows.update((list) => list.map((r) => (r.id === row.id ? patched : r)));
  }

  async addRow(): Promise<void> {
    const topic = this.newTopic().trim();
    if (!topic) return;
    const row = await this.boards.addRow(this.teamId(), topic);
    this.rows.update((list) => [...list, row]);
    this.newTopic.set('');
  }

  startEdit(row: BoardRow): void {
    this.editingId.set(row.id);
    this.editTopic.set(row.topic);
  }

  async saveEdit(row: BoardRow): Promise<void> {
    const topic = this.editTopic().trim();
    if (topic && topic !== row.topic) {
      const patched = await this.boards.patchRow(this.teamId(), row.id, { topic });
      this.rows.update((list) => list.map((r) => (r.id === row.id ? patched : r)));
    }
    this.editingId.set(null);
  }

  async deleteRow(row: BoardRow): Promise<void> {
    await this.boards.deleteRow(this.teamId(), row.id);
    this.rows.update((list) => list.filter((r) => r.id !== row.id));
  }

  exportCsv(): void {
    exportBoardCsv(this.teamName(), this.levels(), this.rows(), (l) => this.levelName(l));
  }

  async exportPdf(): Promise<void> {
    try {
      await exportBoardPdf(this.teamName(), this.levels(), this.rows(), (l) => this.levelName(l), {
        asIs: this.transloco.translate('board.as_is'),
        toBe: this.transloco.translate('board.to_be'),
        title: this.transloco.translate('board.title'),
        topic: this.transloco.translate('board.topic'),
      });
    } catch {
      this.messages.add({ severity: 'error', summary: this.transloco.translate('board.export_failed') });
    }
  }

  back(): void {
    this.router.navigate(['/teams', this.teamId()]);
  }
}
