/**
 * dcity.org analytics -- §2 of DCity/ANALYTICS.md (the shared contract for all
 * four dcity.org sites; change it there, not here). The GoatCounter tag itself
 * is in app/layout.tsx (§1).
 *
 * One event per click of an export button, not per file: an STL zip with box,
 * lid and text bodies is still one export. Hermes's collector matches these
 * names exactly, and the dashboard ratio is exports per 100 visitors.
 */

type GoatCounter = { count?: (o: { path: string; title: string; event: boolean }) => void };

export type ExportEvent = 'boxmaker-export-stl' | 'boxmaker-export-3mf';

export function dcCountExport(name: ExportEvent): void {
  if (typeof window === 'undefined') return;
  // Opt-out: a browser that has visited dcity.org/nocount is never counted.
  if (document.cookie.indexOf('dcity_nocount=1') !== -1) return;
  const gc = (window as unknown as { goatcounter?: GoatCounter }).goatcounter;
  if (gc && gc.count) gc.count({ path: name, title: name, event: true });
}
