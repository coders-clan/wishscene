import { it, expect } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

it.each([
  [
    'missing translation',
    'messages/he/common.json',
    (s: string) => {
      const json = JSON.parse(s);
      delete json.language;
      return JSON.stringify(json);
    },
    'Missing he: common.language',
  ],
  [
    'invalid ICU',
    'messages/he/common.json',
    (s: string) => {
      const json = JSON.parse(s);
      json.language = '{broken';
      return JSON.stringify(json);
    },
    'Invalid ICU',
  ],
  [
    'placeholder drift',
    'messages/he/common.json',
    (s: string) => {
      const json = JSON.parse(s);
      json.imagePosition = '{wrong}';
      return JSON.stringify(json);
    },
    'Placeholder mismatch',
  ],
  [
    'physical CSS',
    'src/app/globals.css',
    (s: string) => s + '\n.bad {\n margin-left: 4px;\n}\n',
    'physical CSS property',
  ],
  [
    'unused key',
    'messages/en/common.json',
    (s: string) => {
      const json = JSON.parse(s);
      json.unusedExample = 'Unused example';
      return JSON.stringify(json);
    },
    'Unused key',
  ],
  [
    'hard-coded UI',
    'src/components/language-switcher.tsx',
    (s: string) =>
      s.replace(
        '<div className="language-switcher">',
        '<div className="language-switcher">Uncatalogued label',
      ),
    'hard-coded JSX text',
  ],
])('catalog gate rejects %s', (_name, file, mutate, diagnostic) => {
  const directory = mkdtempSync(join(tmpdir(), 'wishscene-i18n-'));
  try {
    cpSync('apps/web/messages', join(directory, 'apps/web/messages'), { recursive: true });
    cpSync('apps/web/src', join(directory, 'apps/web/src'), { recursive: true });
    const target = join(directory, 'apps/web', file);
    writeFileSync(target, mutate(readFileSync(target, 'utf8')));
    const result = spawnSync(process.execPath, [resolve('scripts/i18n.mjs')], {
      cwd: directory,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(diagnostic);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
