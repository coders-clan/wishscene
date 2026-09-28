// Structured JSON logging for product mode. Everything passes through redact(): magic links,
// signed URLs, session tokens, emails and secrets are credentials or personal data.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Sink = (level: LogLevel, line: string) => void;

// Record ids are not secrets; keep them so log lines can be correlated.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY = /token|secret|password|url|cookie|authorization|email|signature|key|link/i;
const defaultSink: Sink = (level, line) =>
  level === 'error' || level === 'warn' ? console.error(line) : console.log(line);
let sink: Sink = defaultSink;

/** Tests capture log lines here. Pass null to restore the console sink. */
export function setLogSink(next: Sink | null) {
  sink = next ?? defaultSink;
}

export function scrub(text: string) {
  return text
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, '$1?[redacted]')
    .replace(/[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[a-z]{2,}/gi, '[email]')
    .replace(/[A-Za-z0-9_-]{32,}/g, (match) => (UUID.test(match) ? match : '[redacted]'));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return scrub(value);
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1),
    ]),
  );
}

export function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  sink(
    level,
    JSON.stringify({
      level,
      message: scrub(message),
      time: new Date().toISOString(),
      ...(redact(fields) as Record<string, unknown>),
    }),
  );
}
