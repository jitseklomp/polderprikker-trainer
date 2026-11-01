import { readJSON, writeJSON, remove } from './storage.ts';

const KEY = 'speldwerk:stats:v1';
const WORST_KEEP = 5;

export interface Miss {
  name: string;
  hint?: string;
  km: number;
  score: number;
  at: string;
}

export interface CatStats {
  attempts: number;
  scoreSum: number;
  kmSum: number;
  perfect: number;
  worst: Miss[];
}

export type AllStats = Record<string, CatStats>;

const empty = (): CatStats => ({ attempts: 0, scoreSum: 0, kmSum: 0, perfect: 0, worst: [] });

export function loadStats(): AllStats {
  const s = readJSON<AllStats>(KEY, {});
  return s && typeof s === 'object' ? s : {};
}

export function recordAttempt(category: string, m: { name: string; hint?: string; km: number; score: number }): AllStats {
  const all = loadStats();
  const c = { ...empty(), ...(all[category] || {}) };
  c.attempts += 1;
  c.scoreSum += m.score;
  c.kmSum += m.km;
  if (m.score >= 1000) c.perfect += 1;
  c.worst = [...c.worst, { ...m, km: Math.round(m.km * 100) / 100, at: new Date().toISOString().slice(0, 10) }]
    .sort((a, b) => b.km - a.km)
    .slice(0, WORST_KEEP);
  all[category] = c;
  writeJSON(KEY, all);
  return all;
}

export function resetStats(): void {
  remove(KEY);
}
