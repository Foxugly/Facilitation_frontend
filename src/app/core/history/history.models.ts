export interface HistoryDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface HistoryEntry {
  subject: string;
  chosenValue: string;
  /** The level NAME (not the number): an i18n dict, or a raw string for an unknown deck. */
  levelName: Record<string, string> | string;
  roomCode: string;
  decidedAt: string; // ISO
}

export interface HistoryDetail {
  date: string;
  entries: HistoryEntry[];
}
