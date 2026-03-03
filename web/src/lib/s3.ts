/**
 * AWS S3 Client Wrapper
 *
 * Features:
 * - S3 client singleton
 * - Presigned URL generation
 * - CDN URL generation
 */

import { 
  S3Client, 
  GetObjectCommand, 
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ============================================================
// Dynamic Configuration
// ============================================================

function getBucket() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('[S3] AWS_S3_BUCKET is not configured. Set it in .env or environment variables.');
  }
  return bucket;
}

function getRegion() {
  return process.env.AWS_REGION || 'us-east-1';
}

function getCdnDomain() {
  return process.env.CDN_DOMAIN || process.env.NEXT_PUBLIC_CDN_DOMAIN || '';
}

// Export config getters (backward compatible)
export const BUCKET = { toString: () => getBucket(), valueOf: () => getBucket() } as unknown as string;
export const REGION = { toString: () => getRegion(), valueOf: () => getRegion() } as unknown as string;
export const CDN_DOMAIN = { toString: () => getCdnDomain(), valueOf: () => getCdnDomain() } as unknown as string;

// ============================================================
// S3 Client (lazy-loaded, rebuilt on config change)
// ============================================================

let _s3Client: S3Client | null = null;
let _s3ConfigKey: string | null = null;

function getS3ConfigKey() {
  return `${getRegion()}:${process.env.AWS_ACCESS_KEY_ID || ''}`;
}

function getS3Client(): S3Client {
  const configKey = getS3ConfigKey();
  
  // Rebuild client when config changes
  if (_s3Client && _s3ConfigKey !== configKey) {
    console.log('[S3] Config changed, recreating client');
    _s3Client.destroy();
    _s3Client = null;
  }
  
  if (!_s3Client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('[S3] AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured.');
    }
    console.log(`[S3] Creating client for region: ${getRegion()}`);
    _s3Client = new S3Client({
      region: getRegion(),
      credentials: { accessKeyId, secretAccessKey },
    });
    _s3ConfigKey = configKey;
  }
  
  return _s3Client;
}

// Backward compatible export
export const s3Client = new Proxy({} as S3Client, {
  get(_, prop) {
    const client = getS3Client();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// ============================================================
// Path Generation
// ============================================================

/**
 * S3 path templates
 */
export const S3_PATHS = {
  /** User-uploaded PDF */
  upload: (userId: string, uploadId: string, fileName: string) =>
    `uploads/${userId}/${uploadId}/${fileName}`,
  
  /** OCR output directory */
  ocr: (docId: string) =>
    `ocr/v1/${docId}/`,
  
  /** OCR output Markdown */
  ocrMarkdown: (docId: string) =>
    `ocr/v1/${docId}/output.md`,
  
  /** OCR output images */
  ocrImage: (docId: string, imageName: string) =>
    `ocr/v1/${docId}/images/${imageName}`,
  
  /** Export files */
  export: (userId: string, jobId: string, fileName: string) =>
    `exports/${userId}/${jobId}/${fileName}`,
  
  /** User avatar */
  avatar: (userId: string, fileName: string) =>
    `avatars/${userId}/${fileName}`,
};

// ============================================================
// URL Generation
// ============================================================

/**
 * Generate CDN URL
 */
export function getCdnUrl(s3Key: string): string {
  return `https://${getCdnDomain()}/${s3Key}`;
}

/**
 * Generate direct S3 URL
 */
export function getS3Url(s3Key: string): string {
  return `https://${getBucket()}.s3.${getRegion()}.amazonaws.com/${s3Key}`;
}

/**
 * Generate upload presigned URL
 */
export async function getUploadUrl(
  s3Key: string,
  contentType: string = 'application/pdf',
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: s3Key,
    ContentType: contentType,
  });
  
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

/**
 * Generate download presigned URL
 */
export async function getDownloadUrl(
  s3Key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: s3Key,
  });
  
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

// ============================================================
// File Operations
// ============================================================

/**
 * List directory contents
 */
export async function listObjects(prefix: string, maxKeys: number = 100) {
  const command = new ListObjectsV2Command({
    Bucket: getBucket(),
    Prefix: prefix,
    MaxKeys: maxKeys,
  });
  
  const result = await getS3Client().send(command);
  return result.Contents || [];
}

/**
 * Delete file
 */
export async function deleteObject(s3Key: string) {
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: s3Key,
  });
  
  await getS3Client().send(command);
}

/**
 * Read file content (text)
 */
export async function getObjectAsText(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: s3Key,
  });
  
  const result = await getS3Client().send(command);
  return await result.Body?.transformToString() || '';
}

/**
 * Read JSON file
 */
export async function getObjectAsJson<T = unknown>(s3Key: string): Promise<T> {
  const text = await getObjectAsText(s3Key);
  return JSON.parse(text) as T;
}

// ============================================================
// Additional Exports
// ============================================================

export { getSignedUrl };
