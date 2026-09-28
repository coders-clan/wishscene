import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  MemoryAssetStore,
  S3AssetStore,
  isObjectKey,
  objectKey,
  s3SettingsFromEnv,
} from './index';

describe('objectKey', () => {
  it('matches the object key format', () => {
    const key = objectKey();
    expect(key.startsWith('o/')).toBe(true);
    expect(isObjectKey(key)).toBe(true);
  });

  it('is unique across many calls', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => objectKey()));
    expect(keys.size).toBe(1000);
  });
});

const testSettings = {
  accessKeyId: 'AKIAEXAMPLEEXAMPLE00',
  secretAccessKey: 'fake-secret-for-tests-only',
  endpoint: 'http://127.0.0.1:59000',
  region: 'us-east-1',
  bucket: 'wishscene-test',
  forcePathStyle: true,
};

describe('S3AssetStore', () => {
  it('presigns an upload policy with the expected conditions', async () => {
    const store = new S3AssetStore(testSettings);
    const key = objectKey();
    const before = Date.now();
    const policy = await store.presignUpload({ key, contentType: 'image/png', maxBytes: 1000 });

    expect(policy.fields['Content-Type']).toBe('image/png');
    expect(policy.url).not.toContain(testSettings.secretAccessKey);

    const decoded = JSON.parse(Buffer.from(policy.fields.Policy, 'base64').toString('utf8'));
    expect(decoded.conditions).toContainEqual(['content-length-range', 1, 1000]);
    expect(decoded.conditions).toContainEqual(['eq', '$Content-Type', 'image/png']);
    expect(decoded.conditions).toContainEqual({ key });
    expect(decoded.conditions).toContainEqual({ bucket: 'wishscene-test' });

    const expiration = new Date(decoded.expiration).getTime();
    expect(Math.abs(expiration - (before + 300_000))).toBeLessThanOrEqual(5000);
  });

  it('presigns a download url with a short expiry and no secret', async () => {
    const store = new S3AssetStore(testSettings);
    const key = objectKey();
    const url = await store.presignDownload({ key });

    expect(url).toContain('X-Amz-Expires=120');
    expect(url).toContain('response-cache-control=private%2C%20no-store');
    expect(url).toContain(encodeURIComponent(key).replace(/%2F/g, '/'));
    expect(url).not.toContain(testSettings.secretAccessKey);
  });

  it('rejects an unsupported content type', async () => {
    const store = new S3AssetStore(testSettings);
    const key = objectKey();
    await expect(
      store.presignUpload({ key, contentType: 'image/gif' as never, maxBytes: 1000 }),
    ).rejects.toThrow('Invalid upload request.');
  });

  it('rejects a zero byte limit', async () => {
    const store = new S3AssetStore(testSettings);
    const key = objectKey();
    await expect(
      store.presignUpload({ key, contentType: 'image/png', maxBytes: 0 }),
    ).rejects.toThrow('Invalid upload request.');
  });

  it('rejects a byte limit above the maximum', async () => {
    const store = new S3AssetStore(testSettings);
    const key = objectKey();
    await expect(
      store.presignUpload({ key, contentType: 'image/png', maxBytes: MAX_UPLOAD_BYTES + 1 }),
    ).rejects.toThrow('Invalid upload request.');
  });

  it('rejects a key that is not the expected shape and never echoes it', async () => {
    const store = new S3AssetStore(testSettings);
    const key = 'users/alice@example.com/photo.jpg';
    let error: Error | undefined;
    try {
      await store.presignUpload({ key, contentType: 'image/png', maxBytes: 1000 });
    } catch (caught) {
      error = caught as Error;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain(key);

    await expect(store.presignDownload({ key })).rejects.toThrow('Invalid object key.');
    await expect(store.head(key)).rejects.toThrow('Invalid object key.');
    await expect(store.delete(key)).rejects.toThrow('Invalid object key.');
  });
});

describe('MemoryAssetStore', () => {
  it('round trips put, head and delete', async () => {
    const store = new MemoryAssetStore();
    const key = objectKey();
    store.put(key, { byteSize: 42, contentType: 'image/png' });

    const head = await store.head(key);
    expect(head).toEqual({ byteSize: 42, contentType: 'image/png', etag: expect.any(String) });
    // Replacing the object changes its ETag, which is how readers detect a swap.
    store.put(key, { byteSize: 42, contentType: 'image/png' });
    expect((await store.head(key))?.etag).not.toBe(head?.etag);

    await store.delete(key);
    expect(store.deleted).toContain(key);
    expect(await store.head(key)).toBeNull();
  });

  it('returns null for an unknown key', async () => {
    const store = new MemoryAssetStore();
    expect(await store.head(objectKey())).toBeNull();
  });
});

describe('s3SettingsFromEnv', () => {
  it('reports all missing required variables for an empty env', () => {
    const { settings, missing } = s3SettingsFromEnv({});
    expect(settings).toBeNull();
    expect(missing.sort()).toEqual(
      ['S3_ACCESS_KEY_ID', 'S3_BUCKET', 'S3_REGION', 'S3_SECRET_ACCESS_KEY'].sort(),
    );
  });

  it('builds settings from a full env and parses forcePathStyle', () => {
    const { settings, missing } = s3SettingsFromEnv({
      S3_ENDPOINT: 'http://127.0.0.1:59000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'wishscene-test',
      S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE00',
      S3_SECRET_ACCESS_KEY: 'fake-secret-for-tests-only',
      S3_FORCE_PATH_STYLE: '1',
    });
    expect(missing).toEqual([]);
    expect(settings).toEqual({
      endpoint: 'http://127.0.0.1:59000',
      region: 'us-east-1',
      bucket: 'wishscene-test',
      accessKeyId: 'AKIAEXAMPLEEXAMPLE00',
      secretAccessKey: 'fake-secret-for-tests-only',
      forcePathStyle: true,
    });
  });
});
