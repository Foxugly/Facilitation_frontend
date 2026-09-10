import { BoardLevel, BoardRow } from '../../core/boards/boards.models';

type NameFn = (level: BoardLevel) => string;

function nameOf(levels: BoardLevel[], name: NameFn, value: string | null): string {
  if (!value) return '';
  const level = levels.find((l) => l.value === value);
  return level ? name(level) : value;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(teamName: string): string {
  return (teamName || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
}

/** CSV matrix: one row per topic, AS-IS and TO-BE resolved to their level name. */
export function exportBoardCsv(teamName: string, levels: BoardLevel[], rows: BoardRow[], name: NameFn): void {
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const header = ['Topic', 'AS-IS', 'TO-BE'].map(esc).join(',');
  const body = rows.map((r) =>
    [r.topic, nameOf(levels, name, r.asIs), nameOf(levels, name, r.toBe)].map(esc).join(','),
  );
  const csv = '﻿' + [header, ...body].join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${slug(teamName)}-board.csv`);
}

/** PDF grid (topics × 7 levels) with coloured AS-IS / TO-BE cells. jsPDF is loaded on demand. */
export async function exportBoardPdf(
  teamName: string,
  levels: BoardLevel[],
  rows: BoardRow[],
  name: NameFn,
  labels: { asIs: string; toBe: string; title: string; topic: string },
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(15);
  doc.text(`${labels.title} — ${teamName}`, 40, 34);

  const head = [[labels.topic, ...levels.map((l) => `${l.value} · ${name(l)}`)]];
  const body = rows.map((r) => [
    r.topic,
    ...levels.map((l) => {
      const marks: string[] = [];
      if (r.asIs === l.value) marks.push(labels.asIs);
      if (r.toBe === l.value) marks.push(labels.toBe);
      return marks.join(' / ');
    }),
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 48,
    styles: { fontSize: 8, halign: 'center', valign: 'middle', cellWidth: 'wrap' },
    headStyles: { fillColor: [16, 185, 129], textColor: [5, 38, 28] },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 120 } },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index === 0) return;
      const text = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text);
      const hasAsIs = text.includes(labels.asIs);
      const hasToBe = text.includes(labels.toBe);
      if (hasAsIs && hasToBe) {
        data.cell.styles.fillColor = [190, 210, 120];
      } else if (hasAsIs) {
        data.cell.styles.fillColor = [251, 191, 36];
      } else if (hasToBe) {
        data.cell.styles.fillColor = [52, 211, 153];
      }
      data.cell.styles.textColor = [28, 25, 23];
      data.cell.styles.fontStyle = 'bold';
    },
  });

  doc.save(`${slug(teamName)}-board.pdf`);
}
