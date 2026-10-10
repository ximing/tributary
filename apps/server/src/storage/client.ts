import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config, type S3Config } from '../config.js';

/**
 * 通用对象存储（S3 兼容，私有桶）。
 * 写：putObject / presignPut；读：一律走 presignGet 临时链接，桶保持私有。
 * 配置见 config.ts 的 resolveS3（与 inwit 同一 endpoint/region/鉴权）。
 */
const PUT_TTL_SEC = 15 * 60;
const GET_TTL_SEC = 3600;

let cached: { cfg: S3Config; client: S3Client } | null = null;

export function isStorageConfigured(): boolean {
  const cfg = config.s3;
  return Boolean(cfg.endpoint && cfg.region && cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey);
}

function getClient(): { cfg: S3Config; client: S3Client } {
  if (!isStorageConfigured()) throw new Error('对象存储未配置');
  const cfg = config.s3;
  if (cached && JSON.stringify(cached.cfg) === JSON.stringify(cfg)) return cached;
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // 兼容 S3 兼容厂商的校验头行为
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  cached = { cfg, client };
  return cached;
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const { cfg, client } = getClient();
  await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }));
}

/** 客户端直传用的预签名 PUT 链接 */
export async function presignPut(key: string, contentType: string, ttlSec = PUT_TTL_SEC): Promise<string> {
  const { cfg, client } = getClient();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }), {
    expiresIn: ttlSec,
  });
}

/** 私有对象的临时访问链接（默认 1 小时） */
export async function presignGet(key: string, ttlSec = GET_TTL_SEC): Promise<string> {
  const { cfg, client } = getClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: ttlSec });
}

export async function deleteObject(key: string): Promise<void> {
  const { cfg, client } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
