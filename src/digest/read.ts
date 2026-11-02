import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Parse one log line at the edge. Anything off-shape is null, never an exception.
export function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status as RunStatus)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status: status as RunStatus, owner };
  if (error !== undefined) line.error = error;
  return line;
}

// Fold a night's lines into one row per job, sorted by job name.
// `at` is compared as an instant (offsets may differ) but kept as the log's string.
export function digest(lines: RunLine[]): DigestRow[] {
  type Acc = { row: DigestRow; firstMs: number; lastMs: number };
  const byJob = new Map<string, Acc>();
  for (const l of lines) {
    const ms = Date.parse(l.at);
    const acc = byJob.get(l.job);
    if (!acc) {
      byJob.set(l.job, {
        row: {
          job: l.job,
          owner: l.owner,
          runs: 1,
          retries: l.status === 'retry' ? 1 : 0,
          lastStatus: l.status,
          lastError: l.error ?? null,
          first: l.at,
          last: l.at,
        },
        firstMs: ms,
        lastMs: ms,
      });
      continue;
    }
    acc.row.runs += 1;
    if (l.status === 'retry') acc.row.retries += 1;
    if (ms < acc.firstMs) {
      acc.firstMs = ms;
      acc.row.first = l.at;
    }
    // Ties go to the later line in the file.
    if (ms >= acc.lastMs) {
      acc.lastMs = ms;
      acc.row.last = l.at;
      acc.row.lastStatus = l.status;
      acc.row.lastError = l.error ?? null;
      acc.row.owner = l.owner;
    }
  }
  return [...byJob.values()]
    .map((a) => a.row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

// See ReadNight in ./types.ts: null when there is no file for the night, never throws on
// content. Blank lines (e.g. the trailing newline) are skipped, not counted as bad.
export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line) lines.push(line);
    else badLines += 1;
  }
  const result: Night = { night, rows: digest(lines), badLines };
  return result;
};

function isNotFound(e: unknown): boolean {
  if (typeof e !== 'object' || e === null || !('code' in e)) return false;
  return e.code === 'ENOENT' || e.code === 'EISDIR' || e.code === 'ENOTDIR';
}
