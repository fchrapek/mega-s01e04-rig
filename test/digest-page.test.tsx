import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest page', () => {
  it('renders 2026-10-28 with jobs and a dash for a null owner', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('fixtures/refresh');
    expect(html).toMatch(/digest\/render<\/td><td>—<\/td>/);
    expect(html).toContain('class="warn"');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2020-01-01');
    expect(res.status).toBe(404);
  });

  it('renders an empty night as nothing ran, and counts bad lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    writeFileSync(join(dir, '2026-11-02.jsonl'), 'not json\n');
    const app = createApp({ ...config, runsDir: dir });
    expect(await (await app.request('/digest/2026-11-01')).text()).toContain('nothing ran');
    const bad = await (await app.request('/digest/2026-11-02')).text();
    expect(bad).toContain('1 line did not parse');
  });
});
