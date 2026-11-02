import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseLine, readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

function mustRead(runsDir: string, night: string): Night {
  const n = readNight(runsDir, night);
  if (!n) throw new Error(`no night ${night}`);
  return n;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const n = mustRead('runs', '2026-10-28');

  it('has 5 jobs, sorted by name, and counts the truncated last line', () => {
    expect(n.badLines).toBe(1);
    expect(n.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds lane/sync: runs, retries, last status, times as written', () => {
    const r = n.rows.find((x) => x.job === 'lane/sync');
    expect(r).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-10-28T23:00:06+01:00',
      last: '2026-10-29T05:00:04+01:00',
    });
  });

  it('counts retries and takes status and error from the latest line', () => {
    const fixtures = n.rows.find((x) => x.job === 'fixtures/refresh');
    expect(fixtures).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    const backup = n.rows.find((x) => x.job === 'notes/backup');
    expect(backup).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a row whose owner is null', () => {
    const r = n.rows.find((x) => x.job === 'digest/render');
    expect(r).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', first: '2026-10-29T05:41:09+01:00' });
  });
});

describe('readNight on runs/2026-10-27.jsonl', () => {
  it('has 4 jobs over 7 lines and no bad lines', () => {
    const n = mustRead('runs', '2026-10-27');
    expect(n.badLines).toBe(0);
    expect(n.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(n.rows.reduce((sum, r) => sum + r.runs, 0)).toBe(7);
    expect(n.rows.every((r) => r.lastStatus === 'ok' && r.retries === 0)).toBe(true);
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts off-shape lines and orders by instant across offsets', () => {
    writeFileSync(
      join(dir, '2026-01-03.jsonl'),
      [
        // 02:00+01:00 is 01:00Z: later than the next line, though written first.
        '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"retry","owner":"x","error":"late"}',
        '{"at":"2026-01-03T00:30:00Z","job":"a","status":"fail","owner":"x","error":"early"}',
        '[1,2]',
        '{"at":"2026-01-03T01:00:00Z","job":"b","status":"maybe","owner":null}',
        '{"job":"c","status":"ok","owner":null}',
        '',
      ].join('\n'),
    );
    const n = mustRead(dir, '2026-01-03');
    expect(n.badLines).toBe(3);
    expect(n.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 2,
        retries: 1,
        lastStatus: 'retry',
        lastError: 'late',
        first: '2026-01-03T00:30:00Z',
        last: '2026-01-03T02:00:00+01:00',
      },
    ]);
  });
});

describe('parseLine', () => {
  it('rejects a non-string error and a non-string owner', () => {
    expect(parseLine('{"at":"2026-01-01T00:00:00Z","job":"a","status":"ok","owner":null,"error":5}')).toBeNull();
    expect(parseLine('{"at":"2026-01-01T00:00:00Z","job":"a","status":"ok","owner":1}')).toBeNull();
  });
});
