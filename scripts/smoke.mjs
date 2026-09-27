// HTTP-only integration smoke test against the built Next.js application.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const base = 'http://127.0.0.1:3101';
const child = spawn('pnpm', ['--filter', '@wishscene/web', 'start', '--port', '3101'], {
  env: { ...process.env, WISHSCENE_MOCK: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let logs = '';
child.stdout.on('data', (data) => {
  logs += data;
});
child.stderr.on('data', (data) => {
  logs += data;
});
let cookie = '';
async function request(path, method = 'GET', input) {
  const response = await fetch(`${base}/api/v1/${path}`, {
    method,
    headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
  const result = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(result)}`);
  return result;
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try {
      ready = (await fetch(base)).ok;
    } catch {
      /* Server is starting. */
    }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, `Server did not become ready: ${logs}`);
  const page = await (await fetch(base)).text();
  assert.match(page, /wishscene/);
  const workspace = await request('workspace');
  const exp = workspace.experiences[0];
  for (const scene of exp.scenes.filter((x) => x.status !== 'approved'))
    await request(`experiences/${exp.id}/scenes/${scene.id}/generations`, 'POST', {
      requestKey: `smoke-${scene.id}`,
      scenario: 'success',
    });
  await delay(2600);
  const completed = await request('workspace');
  for (const scene of completed.experiences[0].scenes)
    await request(`experiences/${exp.id}/scenes/${scene.id}/approval`, 'POST', {
      assetId: scene.assets.at(-1).id,
      expectedVersion: 1,
    });
  const manifest = await request(`experiences/${exp.id}/exports`, 'POST', {});
  assert.equal(manifest.assets.length, 4);
  assert.equal(manifest.mock, true);
  for (const asset of manifest.assets) {
    const image = await fetch(`${base}${asset.image}`);
    assert.equal(image.status, 200);
    assert.match(await image.text(), /<svg/);
  }
  await request(`experiences/${exp.id}/story`, 'PATCH', {
    expectedVersion: 1,
    outfit: 'Blue linen suit',
    mood: 'Adventure',
  });
  const blocked = await fetch(`${base}/api/v1/experiences/${exp.id}/exports`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(blocked.status, 409);
  console.log(
    'PASS: production server, session cookie, generation, approval, export manifest, SVG assets, stale export guard.',
  );
} finally {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* Already stopped. */
  }
}
