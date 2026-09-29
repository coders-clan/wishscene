import { createPrisma, type PrismaClient } from '@wishscene/db';
import { S3AssetStore, type AssetStore } from '@wishscene/storage';
import { DomainError } from '@wishscene/domain';
import { securePostgresConnectionString } from '../postgres';
import { createProductAuth, type ProductAuth } from './auth';
import { productConfig } from './config';
import { FileOutboxMailer } from './mailer';

export interface ProductRuntime {
  prisma: PrismaClient;
  auth: ProductAuth;
  assets: AssetStore;
}

let current: ProductRuntime | undefined;

/** Tests inject a runtime backed by a throwaway database and in-memory fakes. */
export function setProductRuntime(runtime: ProductRuntime | undefined) {
  current = runtime;
}

/** Per-process singletons. Throws 503 PRODUCT_MISCONFIGURED naming only missing variables. */
export function productRuntime(): ProductRuntime {
  if (current) return current;
  const { config, missing } = productConfig();
  if (!config)
    throw new DomainError(
      503,
      'PRODUCT_MISCONFIGURED',
      `Product mode is missing: ${missing.join(', ')}.`,
    );
  const prisma = createPrisma(securePostgresConnectionString(config.databaseUrl));
  current = {
    prisma,
    auth: createProductAuth({
      prisma,
      secret: config.secret,
      baseURL: config.baseURL,
      mailer: new FileOutboxMailer(),
      ipAddressHeaders: config.ipAddressHeaders,
      trustedProxies: config.trustedProxies,
    }),
    assets: new S3AssetStore(config.s3),
  };
  return current;
}
