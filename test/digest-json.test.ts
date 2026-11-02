import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /api/digest/:night', () => {
  it('returns the reader output for a night', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    const expected = readNight('runs', '2026-10-28');
    expect(expected).not.toBeNull();
    expect(body.rows).toHaveLength(5);
    expect(body.rows.map((r) => r.job)).toEqual(expected?.rows.map((r) => r.job));
    expect(body.badLines).toBe(1);
    expect(body).toEqual(expected);
  });

  it('answers 404 JSON for a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });
});
