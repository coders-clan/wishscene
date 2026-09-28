import { randomBytes } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const UPLOAD_TTL_SECONDS = 300;
export const DOWNLOAD_TTL_SECONDS = 120;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

export function isUploadContentType(value: string): value is UploadContentType {
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(value);
}

const OBJECT_KEY_PATTERN = /^o\/[A-Za-z0-9_-]{43}$/;

// 32 random bytes, base64url-encoded; never carries user, email or file names.
export function objectKey(): string {
  return 'o/' + randomBytes(32).toString('base64url');
}

export function isObjectKey(key: string): boolean {
  return OBJECT_KEY_PATTERN.test(key);
}

export interface UploadPolicy {
  url: string;
  fields: Record<string, string>;
}

export interface ObjectHead {
  byteSize: number;
  contentType: string | null;
  /** Identifies this exact object version; readers pass it as If-Match. */
  etag: string | null;
}

export interface AssetStore {
  presignUpload(input: {
    key: string;
    contentType: UploadContentType;
    maxBytes: number;
  }): Promise<UploadPolicy>;
  presignDownload(input: { key: string }): Promise<string>;
  head(key: string): Promise<ObjectHead | null>;
  delete(key: string): Promise<void>;
}

function assertUploadRequest(input: { key: string; contentType: string; maxBytes: number }): void {
  const validKey = isObjectKey(input.key);
  const validContentType = isUploadContentType(input.contentType);
  const validMaxBytes =
    Number.isInteger(input.maxBytes) && input.maxBytes >= 1 && input.maxBytes <= MAX_UPLOAD_BYTES;
  if (!validKey || !validContentType || !validMaxBytes) {
    throw new Error('Invalid upload request.');
  }
}

function assertObjectKey(key: string): void {
  if (!isObjectKey(key)) {
    throw new Error('Invalid object key.');
  }
}

export interface S3Settings {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3AssetStore implements AssetStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(settings: S3Settings) {
    this.bucket = settings.bucket;
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    });
  }

  async presignUpload(input: {
    key: string;
    contentType: UploadContentType;
    maxBytes: number;
  }): Promise<UploadPolicy> {
    assertUploadRequest(input);
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: input.key,
      Conditions: [
        ['content-length-range', 1, input.maxBytes],
        ['eq', '$Content-Type', input.contentType],
      ],
      Fields: { 'Content-Type': input.contentType },
      Expires: UPLOAD_TTL_SECONDS,
    });
    return { url, fields };
  }

  async presignDownload(input: { key: string }): Promise<string> {
    assertObjectKey(input.key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: DOWNLOAD_TTL_SECONDS },
    );
  }

  async head(key: string): Promise<ObjectHead | null> {
    assertObjectKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        byteSize: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = 'name' in error ? (error as { name?: unknown }).name : undefined;
  if (name === 'NotFound' || name === 'NoSuchKey') {
    return true;
  }
  const metadata =
    '$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      : undefined;
  return metadata?.httpStatusCode === 404;
}

// In-memory fake for tests; never touches the network.
export class MemoryAssetStore implements AssetStore {
  private readonly objects = new Map<string, ObjectHead>();
  readonly deleted: string[] = [];

  /** Stores (or replaces) an object; a new ETag is minted unless one is given. */
  put(key: string, head: Omit<ObjectHead, 'etag'> & { etag?: string }): void {
    this.objects.set(key, { ...head, etag: head.etag ?? `"${randomBytes(16).toString('hex')}"` });
  }

  async presignUpload(input: {
    key: string;
    contentType: UploadContentType;
    maxBytes: number;
  }): Promise<UploadPolicy> {
    assertUploadRequest(input);
    return {
      url: 'https://storage.memory.invalid/upload',
      fields: {
        key: input.key,
        'Content-Type': input.contentType,
        Policy: randomBytes(24).toString('base64url'),
        'X-Amz-Signature': randomBytes(16).toString('hex'),
      },
    };
  }

  async presignDownload(input: { key: string }): Promise<string> {
    assertObjectKey(input.key);
    const signature = randomBytes(16).toString('hex');
    return `https://storage.memory.invalid/${input.key}?X-Amz-Expires=120&X-Amz-Signature=${signature}`;
  }

  async head(key: string): Promise<ObjectHead | null> {
    assertObjectKey(key);
    const found = this.objects.get(key);
    return found ? { ...found } : null;
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    this.objects.delete(key);
    this.deleted.push(key);
  }
}

const REQUIRED_ENV_KEYS = [
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export function s3SettingsFromEnv(env: NodeJS.ProcessEnv = process.env): {
  settings: S3Settings | null;
  missing: string[];
} {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    return { settings: null, missing };
  }
  const forcePathStyle = env.S3_FORCE_PATH_STYLE === '1' || env.S3_FORCE_PATH_STYLE === 'true';
  return {
    settings: {
      endpoint: env.S3_ENDPOINT?.trim() || undefined,
      region: env.S3_REGION as string,
      bucket: env.S3_BUCKET as string,
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      forcePathStyle,
    },
    missing: [],
  };
}

export function assetStoreFromEnv(env: NodeJS.ProcessEnv = process.env): AssetStore | null {
  const { settings } = s3SettingsFromEnv(env);
  return settings ? new S3AssetStore(settings) : null;
}
