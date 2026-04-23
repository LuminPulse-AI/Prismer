import fs from 'node:fs/promises';
import path from 'node:path';
import type { PaperMeta } from '@/lib/storage/types';
import type { PaperMetadata } from '@/types/paperContext';

const DEFAULT_LOCAL_OCR_ROOT = path.join(process.cwd(), 'data', 'ocr');
const LEGACY_PUBLIC_OCR_ROOT = path.join(process.cwd(), 'public', 'data', 'output');

type OCRStatistics = {
  papers?: Array<{ arxiv_id?: string | null }>;
};

interface LocalPaperDataAvailability {
  metadataPath: string | null;
  ocrResultPath: string | null;
  detectionsPath: string | null;
  markdownPath: string | null;
  pdfPath: string | null;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function resolveConfiguredRoot(root: string): string {
  if (path.isAbsolute(root)) {
    return root;
  }
  return path.join(process.cwd(), root);
}

function resolveSafePaperRelativePath(paperDir: string, relativePath: string): string {
  const normalizedPath = path.posix.normalize(relativePath).replace(/^(\.\.\/)+/, '');
  if (!normalizedPath || normalizedPath.startsWith('../')) {
    throw new Error('Invalid OCR file path');
  }

  const targetPath = path.join(paperDir, normalizedPath);
  const relativeFromPaper = path.relative(paperDir, targetPath);
  if (relativeFromPaper.startsWith('..') || path.isAbsolute(relativeFromPaper)) {
    throw new Error('Invalid OCR file path');
  }

  return targetPath;
}

export function getOCRDataRoots(): string[] {
  const configuredRoots = (process.env.OCR_DATA_ROOTS || process.env.OCR_DATA_ROOT || '')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(resolveConfiguredRoot);

  return unique([
    ...configuredRoots,
    DEFAULT_LOCAL_OCR_ROOT,
    LEGACY_PUBLIC_OCR_ROOT,
  ]);
}

export function getPrimaryOCRDataRoot(): string {
  const configuredRoots = (process.env.OCR_DATA_ROOTS || process.env.OCR_DATA_ROOT || '')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(resolveConfiguredRoot);

  return configuredRoots[0] || DEFAULT_LOCAL_OCR_ROOT;
}

export async function ensurePrimaryOCRDataRoot(): Promise<string> {
  const root = getPrimaryOCRDataRoot();
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function listPaperIdsFromRoot(root: string): Promise<string[]> {
  const ids = new Set<string>();
  const statsPath = path.join(root, 'ocr_statistics.json');

  if (await pathExists(statsPath)) {
    try {
      const raw = await fs.readFile(statsPath, 'utf8');
      const stats = JSON.parse(raw) as OCRStatistics;
      for (const paper of stats.papers || []) {
        if (paper.arxiv_id) {
          ids.add(paper.arxiv_id);
        }
      }
    } catch {
      // Ignore malformed stats and fall back to directory scan.
    }
  }

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        ids.add(entry.name);
      }
    }
  } catch {
    // Ignore missing roots.
  }

  return Array.from(ids);
}

async function readJSONFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function listOCRPaperIds(): Promise<string[]> {
  const discovered = await Promise.all(
    getOCRDataRoots().map(async (root) => {
      if (!(await pathExists(root))) return [];
      return listPaperIdsFromRoot(root);
    })
  );

  return unique(discovered.flat()).sort();
}

export async function findOCRPaperDirectory(paperId: string): Promise<string | null> {
  for (const root of getOCRDataRoots()) {
    const candidate = path.join(root, paperId);
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function findOCRFile(paperId: string, relativePath: string): Promise<string | null> {
  const paperDir = await findOCRPaperDirectory(paperId);
  if (!paperDir) return null;

  let filePath: string;
  try {
    filePath = resolveSafePaperRelativePath(paperDir, relativePath);
  } catch {
    return null;
  }

  return (await pathExists(filePath)) ? filePath : null;
}

export async function ensureOCRPaperDirectory(paperId: string): Promise<string> {
  const root = await ensurePrimaryOCRDataRoot();
  const paperDir = path.join(root, paperId);
  await fs.mkdir(paperDir, { recursive: true });
  return paperDir;
}

export async function writeOCRBinaryFile(
  paperId: string,
  fileName: string,
  contents: Uint8Array
): Promise<string> {
  const paperDir = await ensureOCRPaperDirectory(paperId);
  const targetPath = path.join(paperDir, path.basename(fileName));
  await fs.writeFile(targetPath, contents);
  return targetPath;
}

export async function writeOCRBinaryRelativeFile(
  paperId: string,
  relativePath: string,
  contents: Uint8Array
): Promise<string> {
  const paperDir = await ensureOCRPaperDirectory(paperId);
  const targetPath = resolveSafePaperRelativePath(paperDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, contents);
  return targetPath;
}

export async function writeOCRTextFile(
  paperId: string,
  fileName: string,
  contents: string
): Promise<string> {
  const paperDir = await ensureOCRPaperDirectory(paperId);
  const targetPath = path.join(paperDir, path.basename(fileName));
  await fs.writeFile(targetPath, contents, 'utf8');
  return targetPath;
}

export async function findOCRPdfFile(paperId: string): Promise<string | null> {
  const paperDir = await findOCRPaperDirectory(paperId);
  if (!paperDir) return null;

  const preferredNames = [
    `${paperId}.pdf`,
    'paper.pdf',
    'document.pdf',
  ];

  for (const fileName of preferredNames) {
    const candidate = path.join(paperDir, fileName);
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  try {
    const entries = await fs.readdir(paperDir, { withFileTypes: true });
    const pdfEntry = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'));
    return pdfEntry ? path.join(paperDir, pdfEntry.name) : null;
  } catch {
    return null;
  }
}

async function getLocalPaperAvailability(paperId: string): Promise<LocalPaperDataAvailability> {
  const [metadataPath, ocrResultPath, detectionsPath, markdownPath, pdfPath] = await Promise.all([
    findOCRFile(paperId, 'metadata.json'),
    findOCRFile(paperId, 'ocr_result.json'),
    findOCRFile(paperId, 'detections.json'),
    findOCRFile(paperId, 'paper.md'),
    findOCRPdfFile(paperId),
  ]);

  return {
    metadataPath,
    ocrResultPath,
    detectionsPath,
    markdownPath,
    pdfPath,
  };
}

export async function getLocalPaperMeta(paperId: string): Promise<PaperMeta> {
  const availability = await getLocalPaperAvailability(paperId);
  const metadata = availability.metadataPath
    ? await readJSONFile<PaperMetadata>(availability.metadataPath)
    : null;
  const hasOCRData = Boolean(
    availability.ocrResultPath || availability.detectionsPath || availability.markdownPath
  );
  const pdfPath = availability.pdfPath ? `/api/ocr/${paperId}/pdf` : undefined;

  if (!metadata) {
    return {
      id: paperId,
      title: paperId,
      authors: [],
      arxivId: paperId,
      hasOCRData,
      pdfPath,
    } satisfies PaperMeta;
  }

  return {
    id: paperId,
    title: metadata.title || paperId,
    authors: metadata.authors || [],
    arxivId: metadata.arxiv_id || paperId,
    published: metadata.published,
    abstract: metadata.abstract,
    hasOCRData,
    totalPages: metadata.total_pages,
    categories: metadata.categories,
    pdfPath,
  } satisfies PaperMeta;
}

export async function listLocalPapers(): Promise<PaperMeta[]> {
  const paperIds = await listOCRPaperIds();
  const papers = await Promise.all(paperIds.map((paperId) => getLocalPaperMeta(paperId)));

  return papers.sort((a, b) => {
    if (!a.published && !b.published) return a.id.localeCompare(b.id);
    if (!a.published) return 1;
    if (!b.published) return -1;
    return new Date(b.published).getTime() - new Date(a.published).getTime();
  });
}
