import prisma from '@/lib/prisma';

export type AssetType = 'paper' | 'note';
export type AssetStorageProvider = 'local' | 's3' | 'external';

export interface AssetRecord {
  id: number;
  userId: number;
  user_id: number;
  type: AssetType;
  assetType: AssetType;
  asset_type: AssetType;
  title: string;
  description: string | null;
  noteType: string | null;
  note_type: string | null;
  source: string | null;
  content: string | null;
  mimeType: string | null;
  mime_type: string | null;
  storageProvider: AssetStorageProvider | null;
  storage_provider: AssetStorageProvider | null;
  storageKey: string | null;
  storage_key: string | null;
  pdfS3Key: string | null;
  externalUrl: string | null;
  external_url: string | null;
  fileName: string | null;
  file_name: string | null;
  fileUrl: string | null;
  file_url: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  created_at: string;
  updatedAt: string;
  updated_at: string;
}

interface AssetCreateInput {
  userId: number;
  assetType: AssetType;
  title: string;
  description?: string | null;
  abstract?: string | null;
  content?: string | null;
  noteType?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  mimeType?: string | null;
  storageProvider?: AssetStorageProvider | null;
  storageKey?: string | null;
  pdfS3Key?: string | null;
  externalUrl?: string | null;
  fileName?: string | null;
}

interface AssetUpdateInput {
  title?: string;
  description?: string | null;
  content?: string | null;
  noteType?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  mimeType?: string | null;
  storageProvider?: AssetStorageProvider | null;
  storageKey?: string | null;
  externalUrl?: string | null;
  fileName?: string | null;
}

interface AssetListOptions {
  search?: string;
  type?: AssetType;
  limit?: number;
  offset?: number;
  collectionId?: number;
}

function escapeJsonStringValue(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function deriveStorageProvider(input: AssetCreateInput | AssetUpdateInput): AssetStorageProvider | null {
  if (input.storageProvider) return input.storageProvider;
  if ('storageKey' in input && input.storageKey) return 'local';
  if ('pdfS3Key' in input && input.pdfS3Key) return 's3';
  if (input.externalUrl) return 'external';
  return null;
}

export function serializeAsset(asset: {
  id: number;
  userId: number;
  assetType: string;
  title: string;
  description: string | null;
  noteType: string | null;
  source: string | null;
  content: string | null;
  mimeType: string | null;
  storageProvider: string | null;
  storageKey: string | null;
  externalUrl: string | null;
  fileName: string | null;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AssetRecord {
  const type = (asset.assetType === 'note' ? 'note' : 'paper') as AssetType;
  const storageProvider = asset.storageProvider as AssetStorageProvider | null;
  const createdAt = asset.createdAt.toISOString();
  const updatedAt = asset.updatedAt.toISOString();
  const fileUrl = storageProvider === 'external'
    ? asset.externalUrl
    : storageProvider
      ? `/api/v2/assets/${asset.id}/file`
      : null;

  return {
    id: asset.id,
    userId: asset.userId,
    user_id: asset.userId,
    type,
    assetType: type,
    asset_type: type,
    title: asset.title,
    description: asset.description,
    noteType: asset.noteType,
    note_type: asset.noteType,
    source: asset.source,
    content: asset.content,
    mimeType: asset.mimeType,
    mime_type: asset.mimeType,
    storageProvider,
    storage_provider: storageProvider,
    storageKey: asset.storageKey,
    storage_key: asset.storageKey,
    pdfS3Key: storageProvider === 's3' ? asset.storageKey : null,
    externalUrl: asset.externalUrl,
    external_url: asset.externalUrl,
    fileName: asset.fileName,
    file_name: asset.fileName,
    fileUrl,
    file_url: fileUrl,
    metadata: parseJsonObject(asset.metadata),
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
  };
}

export const assetService = {
  async create(input: AssetCreateInput): Promise<AssetRecord> {
    const storageProvider = deriveStorageProvider(input);
    const storageKey = input.storageKey ?? input.pdfS3Key ?? null;

    const asset = await prisma.asset.create({
      data: {
        userId: input.userId,
        assetType: input.assetType,
        title: input.title,
        description: input.description ?? input.abstract ?? null,
        noteType: input.noteType ?? null,
        source: input.source ?? 'local',
        content: input.content ?? null,
        mimeType: input.mimeType ?? null,
        storageProvider,
        storageKey,
        externalUrl: input.externalUrl ?? null,
        fileName: input.fileName ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });

    return serializeAsset(asset);
  },

  async findByUser(userId: number, options: AssetListOptions = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const where = {
      userId,
      ...(options.type ? { assetType: options.type } : {}),
      ...(options.collectionId
        ? {
            collections: {
              some: { collectionId: options.collectionId },
            },
          }
        : {}),
      ...(options.search
        ? {
            OR: [
              { title: { contains: options.search } },
              { description: { contains: options.search } },
            ],
          }
        : {}),
    };

    const [assets, total] = await prisma.$transaction([
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.asset.count({ where }),
    ]);

    return {
      assets: assets.map(serializeAsset),
      total,
      limit,
      offset,
    };
  },

  async findById(id: number, userId?: number): Promise<AssetRecord | null> {
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ...(typeof userId === 'number' ? { userId } : {}),
      },
    });

    return asset ? serializeAsset(asset) : null;
  },

  async findBySourceId(
    userId: number,
    sourceId: string,
    assetType?: AssetType
  ): Promise<AssetRecord | null> {
    const escapedSourceId = escapeJsonStringValue(sourceId);
    const asset = await prisma.asset.findFirst({
      where: {
        userId,
        ...(assetType ? { assetType } : {}),
        metadata: {
          contains: `"sourceId":"${escapedSourceId}"`,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return asset ? serializeAsset(asset) : null;
  },

  async update(id: number, userId: number, input: AssetUpdateInput): Promise<AssetRecord | null> {
    const existing = await prisma.asset.findFirst({
      where: { id, userId },
    });

    if (!existing) return null;

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.noteType !== undefined ? { noteType: input.noteType } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
        ...(input.externalUrl !== undefined ? { externalUrl: input.externalUrl } : {}),
        ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
        ...(input.metadata !== undefined ? { metadata: JSON.stringify(input.metadata) } : {}),
        ...(input.storageProvider !== undefined || input.storageKey !== undefined
          ? {
              storageProvider: deriveStorageProvider(input),
              storageKey: input.storageKey ?? null,
            }
          : {}),
      },
    });

    return serializeAsset(asset);
  },
};
