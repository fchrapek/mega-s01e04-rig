import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { parseLine, readNight } from './digest/read.js';

// Counts of run lines by status across a night. Computed from readNight, never typed.
export type NightCounts = { ok: number; retry: number; fail: number };

export type NightEntry = {
  night: string;
  counts: NightCounts | null; // null when the file is unreadable; the view shows `—`
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightEntry[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// DigestRow folds lines per job and drops the ok / fail split, so the counts come from the
// parsed lines themselves (parseLine, the reader's own edge). readNight gates readability.
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  try {
    if (!readNight(runsDir, night)) return null;
    const text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
    const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
    for (const raw of text.split(/\r?\n/)) {
      if (raw.trim() === '') continue;
      const line = parseLine(raw);
      if (line) counts[line.status] += 1;
    }
    return counts;
  } catch {
    return null;
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({
      night,
      counts: nightCounts(config.runsDir, night),
    })),
  };
}
