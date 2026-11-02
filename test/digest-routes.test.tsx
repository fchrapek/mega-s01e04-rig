import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const line = (at: string, job: string, status: string, owner: string | null) =>
  JSON.stringify({ at, job, status, owner });

let tmp: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(
    join(tmp, '2026-11-01.jsonl'),
    [
      line('2026-11-01T01:00:00+01:00', 'zeta/sync', 'ok', 'filip'),
      line('2026-11-01T01:05:00+01:00', 'alpha/build', 'retry', null),
      line('2026-11-01T01:10:00+01:00', 'alpha/build', 'ok', 'filip'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(tmp, '2026-11-02.jsonl'), '');
  writeFileSync(
    join(tmp, '2026-11-03.jsonl'),
    `${line('2026-11-03T02:00:00+01:00', 'alpha/build', 'ok', 'filip')}\n{broken\n`,
  );
  app = createApp({ ...base, runsDir: tmp });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('digest routes on a temp runs dir', () => {
  it('answers 200 on both routes for a night file', async () => {
    const page = await app.request('/digest/2026-11-01');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('alpha/build');
    expect(html).toContain('zeta/sync');
    const api = await app.request('/api/digest/2026-11-01');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;
    expect(body.night).toBe('2026-11-01');
    expect(body.rows).toHaveLength(2);
  });

  it('answers 404 on both routes for a night with no file', async () => {
    expect((await app.request('/digest/2026-12-31')).status).toBe(404);
    expect((await app.request('/api/digest/2026-12-31')).status).toBe(404);
  });

  it('handles the empty night', async () => {
    const html = await (await app.request('/digest/2026-11-02')).text();
    expect(html).toContain('nothing ran');
    const body = (await (await app.request('/api/digest/2026-11-02')).json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('keeps serving a night with a bad line and says so', async () => {
    const page = await app.request('/digest/2026-11-03');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('1 line did not parse');
    const api = await app.request('/api/digest/2026-11-03');
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it('shows the same jobs in the same order on the page and in the JSON', async () => {
    const html = await (await app.request('/digest/2026-11-01')).text();
    const body = (await (await app.request('/api/digest/2026-11-01')).json()) as Night;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha/build', 'zeta/sync']);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
