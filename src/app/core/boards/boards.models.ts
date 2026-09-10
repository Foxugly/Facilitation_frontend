export interface BoardLevel {
  value: string;
  /** Translated level name: an i18n dict, or a raw string for an unknown deck. */
  name: Record<string, string> | string;
}

export interface BoardRow {
  id: number;
  topic: string;
  asIs: string | null;
  toBe: string | null;
  order: number;
}

export interface Board {
  levels: BoardLevel[];
  rows: BoardRow[];
}

export type Dimension = 'asIs' | 'toBe';
