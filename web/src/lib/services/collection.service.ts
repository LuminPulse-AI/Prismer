import prisma from '@/lib/prisma';
import { serializeAsset } from './asset.service';

export interface CollectionRecord {
  id: number;
  userId: number;
  user_id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  metadata: Record<string, unknown>;
  assetCount: number;
  asset_count: number;
  createdAt: string;
  created_at: string;
  updatedAt: string;
  updated_at: string;
  assets?: ReturnType<typeof serializeAsset>[];
}

interface CollectionCreateInput {
  userId: number;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  metadata?: Record<string, unknown>;
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

function serializeCollection(
  collection: {
    id: number;
    userId: number;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    metadata: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  assetCount: number,
  assets?: ReturnType<typeof serializeAsset>[]
): CollectionRecord {
  const createdAt = collection.createdAt.toISOString();
  const updatedAt = collection.updatedAt.toISOString();

  return {
    id: collection.id,
    userId: collection.userId,
    user_id: collection.userId,
    name: collection.name,
    description: collection.description,
    color: collection.color,
    icon: collection.icon,
    metadata: parseJsonObject(collection.metadata),
    assetCount,
    asset_count: assetCount,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
    ...(assets ? { assets } : {}),
  };
}

export const collectionService = {
  async create(input: CollectionCreateInput): Promise<CollectionRecord> {
    const collection = await prisma.collection.create({
      data: {
        userId: input.userId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });

    return serializeCollection(collection, 0);
  },

  async findByUser(userId: number): Promise<CollectionRecord[]> {
    const collections = await prisma.collection.findMany({
      where: { userId },
      include: {
        _count: {
          select: { assets: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return collections.map((collection) =>
      serializeCollection(collection, collection._count.assets)
    );
  },

  async addAsset(collectionId: number, assetId: number, userId?: number) {
    if (typeof userId === 'number') {
      const [collection, asset] = await Promise.all([
        prisma.collection.findFirst({ where: { id: collectionId, userId } }),
        prisma.asset.findFirst({ where: { id: assetId, userId } }),
      ]);

      if (!collection || !asset) {
        throw new Error('Collection or asset not found');
      }
    }

    await prisma.collectionAsset.upsert({
      where: {
        collectionId_assetId: {
          collectionId,
          assetId,
        },
      },
      update: {},
      create: {
        collectionId,
        assetId,
      },
    });

    return { collectionId, assetId };
  },

  async getById(collectionId: number, userId?: number): Promise<CollectionRecord | null> {
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        ...(typeof userId === 'number' ? { userId } : {}),
      },
      include: {
        _count: {
          select: { assets: true },
        },
        assets: {
          include: { asset: true },
          orderBy: { addedAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!collection) return null;

    return serializeCollection(
      collection,
      collection._count.assets,
      collection.assets.map((item) => serializeAsset(item.asset))
    );
  },
};
