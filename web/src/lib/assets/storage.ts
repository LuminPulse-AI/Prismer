import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const DEFAULT_ROOT = path.join(process.cwd(), 'data', 'assets');

const MIME_BY_EXTENSION: Record<string, string> = {
  '.csv': 'text/csv',
  '.ipynb': 'application/x-ipynb+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/json': '.json',
  'application/pdf': '.pdf',
  'application/x-ipynb+json': '.ipynb',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'text/csv': '.csv',
  'text/markdown': '.md',
  'text/plain': '.txt',
};

export interface StoredLocalAssetFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'asset';
}

function normalizeMimeType(mimeType?: string): string | undefined {
  return mimeType?.split(';')[0]?.trim() || undefined;
}

function inferExtension(fileName?: string, mimeType?: string): string {
  const normalizedMime = normalizeMimeType(mimeType);
  const extensionFromName = fileName ? path.extname(fileName).toLowerCase() : '';
  if (extensionFromName) return extensionFromName;
  if (normalizedMime && EXTENSION_BY_MIME[normalizedMime]) return EXTENSION_BY_MIME[normalizedMime];
  return '.bin';
}

export function inferMimeType(fileName?: string, mimeType?: string): string {
  const normalizedMime = normalizeMimeType(mimeType);
  if (normalizedMime) return MIME_BY_EXTENSION[inferExtension(fileName, normalizedMime)] || normalizedMime;

  const extension = inferExtension(fileName);
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

export function getLocalAssetStorageRoot(): string {
  return process.env.LOCAL_ASSET_STORAGE_DIR || DEFAULT_ROOT;
}

export function resolveLocalAssetPath(storageKey: string): string {
  const root = path.resolve(getLocalAssetStorageRoot());
  const resolved = path.resolve(root, storageKey);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid asset storage path');
  }

  return resolved;
}

export async function ensureLocalAssetStorageRoot(): Promise<string> {
  const root = getLocalAssetStorageRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export async function storeLocalAssetBuffer(input: {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
  workspaceId?: string;
  category?: string;
}): Promise<StoredLocalAssetFile> {
  const root = await ensureLocalAssetStorageRoot();
  const extension = inferExtension(input.fileName, input.mimeType);
  const mimeType = inferMimeType(input.fileName, input.mimeType);
  const baseName = input.fileName
    ? path.basename(input.fileName, path.extname(input.fileName))
    : 'asset';
  const safeBaseName = sanitizeSegment(baseName);
  const relativeDir = path.join(
    sanitizeSegment(input.category || 'uploads'),
    sanitizeSegment(input.workspaceId || 'shared')
  );

  await mkdir(path.join(root, relativeDir), { recursive: true });

  const storedFileName = `${Date.now()}-${safeBaseName}-${randomUUID().slice(0, 8)}${extension}`;
  const relativePath = path.join(relativeDir, storedFileName);
  const absolutePath = path.join(root, relativePath);

  await writeFile(absolutePath, input.buffer);

  return {
    storageKey: relativePath.split(path.sep).join('/'),
    fileName: input.fileName ? path.basename(input.fileName) : storedFileName,
    mimeType,
  };
}

export async function readLocalAssetBuffer(storageKey: string): Promise<Buffer> {
  return readFile(resolveLocalAssetPath(storageKey));
}
