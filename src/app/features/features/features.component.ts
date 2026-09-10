import { Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

interface FeatureRow {
  key: string;
  free: boolean;
  paid: boolean;
}

/**
 * Free vs paid comparison (scope §4.1). Nav item already provided by the fleet
 * chrome. Rows are data-driven; labels come from i18n (features.rows.<key>).
 * Describes Phase-2 paid features — published with Phase 2.
 */
@Component({
  selector: 'app-features',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss',
})
export class FeaturesComponent {
  readonly rows: FeatureRow[] = [
    { key: 'anon_rooms', free: true, paid: true },
    { key: 'standard_deck', free: true, paid: true },
    { key: 'realtime', free: true, paid: true },
    { key: 'langs', free: true, paid: true },
    { key: 'accounts', free: false, paid: true },
    { key: 'history', free: false, paid: true },
    { key: 'board', free: false, paid: true },
    { key: 'custom_decks', free: false, paid: true },
    { key: 'custom_back', free: false, paid: true },
    { key: 'prepared_votes', free: false, paid: true },
    { key: 'export', free: false, paid: true },
    { key: 'email_history', free: false, paid: true },
  ];
}
