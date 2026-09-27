import { describe, expect, it } from 'vitest';
import { securePostgresConnectionString } from './postgres';

describe('Postgres connection security', () => {
  it('forces full certificate and hostname verification when deployed', () => {
    const value = securePostgresConnectionString(
      'postgresql://user:password@db.example/wishscene?sslmode=require',
      true,
    );
    expect(new URL(value).searchParams.get('sslmode')).toBe('verify-full');
  });

  it('also overrides explicitly insecure deployed modes', () => {
    const value = securePostgresConnectionString(
      'postgres://user:password@db.example/wishscene?sslmode=disable',
      true,
    );
    expect(new URL(value).searchParams.get('sslmode')).toBe('verify-full');
  });

  it('leaves local test connections unchanged', () => {
    const value = 'postgres://wishscene@localhost:5432/wishscene';
    expect(securePostgresConnectionString(value, false)).toBe(value);
  });

  it('rejects a non-Postgres production URL', () => {
    expect(() => securePostgresConnectionString('http://db.example', true)).toThrow(
      'must use PostgreSQL',
    );
  });
});
