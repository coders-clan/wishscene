import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@formatjs/icu-messageformat-parser';
import ts from 'typescript';

const root = 'apps/web/messages';
const namespaces = fs
  .readdirSync(`${root}/en`)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .sort();
const read = (locale, ns) => JSON.parse(fs.readFileSync(`${root}/${locale}/${ns}.json`, 'utf8'));
const source = Object.fromEntries(namespaces.map((ns) => [ns, read('en', ns)]));
const write = process.argv.includes('--write');
const files = fs
  .readdirSync('apps/web/src', { recursive: true })
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => 'apps/web/src/' + f);
const code = files
  .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('/catalogs.ts'))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');
const used = (key) =>
  code.includes(`'${key}'`) ||
  code.includes(`"${key}"`) ||
  ['status_', 'enum_', 'tone_', 'platform_', 'format_', 'hint_', 'error_'].some(
    (prefix) => key.startsWith(prefix) && code.includes(prefix + '${'),
  ) ||
  // Domain-defined destinations/moods are displayed through the demo namespace.
  Object.hasOwn(source.demo || {}, key);

const errors = [];
const argumentsOf = (value) => {
  const argumentsFound = new Set();
  const visit = (nodes) =>
    nodes.forEach((n) => {
      if ([1, 2, 3, 4, 5, 6].includes(n.type)) argumentsFound.add(n.value);
      if (n.options) Object.values(n.options).forEach((o) => visit(o.value));
      if (n.children) visit(n.children);
    });
  visit(parse(value));
  return [...argumentsFound].sort().join(',');
};
for (const ns of namespaces)
  for (const [key, value] of Object.entries(source[ns])) {
    if (!used(key)) {
      if (write) delete source[ns][key];
      else errors.push(`Unused key: ${ns}.${key}`);
    }
    try {
      parse(value);
    } catch (e) {
      errors.push(`Invalid ICU: en/${ns}.${key}: ${e.message}`);
    }
  }
if (write)
  for (const ns of namespaces) {
    fs.writeFileSync(`${root}/en/${ns}.json`, JSON.stringify(source[ns], null, 2) + '\n');
    const he = read('he', ns);
    for (const k of Object.keys(he)) if (!Object.hasOwn(source[ns], k)) delete he[k];
    fs.writeFileSync(`${root}/he/${ns}.json`, JSON.stringify(he, null, 2) + '\n');
  }
// Validate every configured shipping locale; partial status must be explicit.
const localeConfig = ts.createSourceFile(
  'locales.ts',
  fs.readFileSync('apps/web/src/i18n/locales.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const configList = (name) => {
  let values = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(localeConfig) === name &&
      node.initializer
    ) {
      let value = node.initializer;
      if (ts.isAsExpression(value)) value = value.expression;
      if (ts.isArrayLiteralExpression(value)) values = value.elements.map((e) => e.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(localeConfig);
  return values;
};
const shippedLocales = configList('supportedLocales');
const partialLocales = configList('partialLocales');
for (const locale of shippedLocales.filter((l) => !['en', 'en-XA', 'ar-XB'].includes(l))) {
  for (const ns of namespaces) {
    const en = source[ns];
    const local = fs.existsSync(`${root}/${locale}/${ns}.json`) ? read(locale, ns) : {};
    if (!partialLocales.includes(locale))
      for (const k of Object.keys(en))
        if (!Object.hasOwn(local, k)) errors.push(`Missing ${locale}: ${ns}.${k}`);
    for (const [k, v] of Object.entries(local)) {
      if (!Object.hasOwn(en, k)) errors.push(`Unexpected ${locale}: ${ns}.${k}`);
      try {
        parse(v);
        if (Object.hasOwn(en, k) && argumentsOf(v) !== argumentsOf(en[k]))
          errors.push(`Placeholder mismatch: ${locale}/${ns}.${k}`);
      } catch (e) {
        errors.push(`Invalid ICU: ${locale}/${ns}.${k}: ${e.message}`);
      }
    }
  }
}
// Pseudo-localization modifies literals only; ICU arguments, numbers and plural logic remain valid.
function pseudo(value, rtl) {
  const accent = (s) =>
    s.replace(
      /[aeiouAEIOU]/g,
      (c) =>
        ({ a: 'á', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Á', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' })[c],
    );
  const literal = (s) =>
    !s.trim()
      ? s
      : rtl
        ? `\u202e${s}\u202c`
        : `${accent(s)}${'~'.repeat(Math.ceil(s.length * 0.35))}`;
  const render = (nodes) =>
    nodes
      .map((n) => {
        if (n.type === 0) return literal(n.value).replaceAll("'", "''");
        if (n.type === 1) return `{${n.value}}`;
        if (n.type === 2 || n.type === 3 || n.type === 4)
          return `{${n.value}, ${n.type === 2 ? 'number' : n.type === 3 ? 'date' : 'time'}${typeof n.style === 'string' ? `, ${n.style}` : ''}}`;
        if (n.type === 5 || n.type === 6)
          return `{${n.value}, ${n.type === 5 ? 'select' : n.pluralType === 'ordinal' ? 'selectordinal' : 'plural'}, ${n.offset ? `offset:${n.offset} ` : ''}${Object.entries(
            n.options,
          )
            .map(([k, v]) => `${k} {${render(v.value)}}`)
            .join(' ')}}`;
        if (n.type === 7) return '#';
        if (n.type === 8) return `<${n.value}>${render(n.children)}</${n.value}>`;
        throw Error('Unsupported ICU element');
      })
      .join('');
  return render(parse(value));
}
for (const locale of ['en-XA', 'ar-XB']) {
  fs.mkdirSync(`${root}/${locale}`, { recursive: true });
  for (const ns of namespaces) {
    const expected = Object.fromEntries(
      Object.entries(source[ns]).map(([k, v]) => [k, pseudo(v, locale === 'ar-XB')]),
    );
    const content = JSON.stringify(expected, null, 2) + '\n';
    if (write) fs.writeFileSync(`${root}/${locale}/${ns}.json`, content);
    else if (
      !fs.existsSync(`${root}/${locale}/${ns}.json`) ||
      fs.readFileSync(`${root}/${locale}/${ns}.json`, 'utf8') !== content
    )
      errors.push(`Stale pseudo-catalog: ${locale}/${ns}`);
  }
}
const locales = fs
  .readdirSync(root)
  .filter((f) => f !== 'descriptions' && fs.statSync(`${root}/${f}`).isDirectory())
  .sort();
let generated = '// Generated by scripts/i18n.mjs --write; do not edit.\n';
const rows = [];
let i = 0;
for (const locale of locales) {
  const entries = [];
  for (const ns of namespaces) {
    if (!fs.existsSync(`${root}/${locale}/${ns}.json`)) continue;
    const name = `catalog${i++}`;
    generated += `import ${name} from '../../messages/${locale}/${ns}.json';\n`;
    entries.push(`${JSON.stringify(ns)}: ${name}`);
  }
  rows.push(`${JSON.stringify(locale)}: {${entries.join(',')}}`);
}
generated += `export const catalogs: Record<string, Record<string, Record<string, string>>> = {${rows.join(',')}};\n`;
if (write) fs.writeFileSync('apps/web/src/i18n/catalogs.ts', generated);
else if (fs.readFileSync('apps/web/src/i18n/catalogs.ts', 'utf8') !== generated)
  errors.push('Stale catalog registry: run pnpm i18n:extract');

for (const file of files.filter((f) => f.endsWith('.tsx') && !f.endsWith('/github-icon.tsx'))) {
  const text = fs.readFileSync(file, 'utf8'),
    sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const diagnostic of sf.parseDiagnostics)
    errors.push(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  const visit = (node) => {
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text.trim()))
      errors.push(`${file}: hard-coded JSX text: ${node.text.trim().slice(0, 70)}`);
    if (
      ts.isJsxAttribute(node) &&
      ['aria-label', 'alt', 'placeholder', 'title', 'label'].includes(node.name.getText(sf)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      /[A-Za-z]/.test(node.initializer.text)
    )
      errors.push(`${file}: hard-coded ${node.name.getText(sf)}`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
// Physical coordinates are intentional only in image/canvas geometry, centered toasts and device safe areas.
for (const file of ['globals', 'mobile', 'feedback'].map((n) => `apps/web/src/app/${n}.css`)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (
      /^\s*(margin|padding|border)-(left|right)\s*:|^\s*(left|right)\s*:|text-align:\s*(left|right)/.test(
        line,
      ) &&
      !line.includes('i18n-physical')
    )
      errors.push(`${file}:${index + 1}: physical CSS property requires geometry justification`);
  });
}
if (write) {
  fs.mkdirSync(`${root}/descriptions`, { recursive: true });
  for (const ns of namespaces) {
    const old = fs.existsSync(`${root}/descriptions/${ns}.json`) ? read('descriptions', ns) : {};
    fs.writeFileSync(
      `${root}/descriptions/${ns}.json`,
      JSON.stringify(
        Object.fromEntries(
          Object.keys(source[ns]).map((k) => [
            k,
            old[k] || `${ns}: ${source[ns][k].replace(/\s+/g, ' ').slice(0, 160)}`,
          ]),
        ),
        null,
        2,
      ) + '\n',
    );
  }
}
if (!write)
  for (const ns of namespaces) {
    const descriptions = fs.existsSync(`${root}/descriptions/${ns}.json`)
      ? read('descriptions', ns)
      : {};
    for (const key of Object.keys(source[ns]))
      if (!descriptions[key]) errors.push(`Missing translator description: ${ns}.${key}`);
  }
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${namespaces.length} namespaces; complete Hebrew; valid ICU; current pseudo-locales; no unused keys, hard-coded JSX or unmarked physical CSS.`,
  );
