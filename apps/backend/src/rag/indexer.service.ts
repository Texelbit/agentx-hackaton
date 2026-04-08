import { Injectable, Logger } from '@nestjs/common';
import { IndexingState } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { EnvConfig } from '../config/env.config';
import { PrismaService } from '../prisma/prisma.service';
import { RagCollection } from './enums/rag-collection.enum';
import { RagService } from './rag.service';

interface FileChunk {
  source: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * One-shot indexer. Walks the cloned Reaction Commerce repo (and the local
 * logs folder) once on first boot and feeds the chunks to `RagService`.
 *
 * Each collection is tracked in `indexing_status` so a restart never
 * re-indexes work that already finished.
 */
@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);

  // Conservative chunk size (in characters) to keep each embedding request
  // well under the 8K-token limit of `text-embedding-3-small`.
  private static readonly MAX_CHUNK_CHARS = 2000;
  private static readonly CODE_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx']);
  // Skip noisy or huge directories.
  private static readonly SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '__tests__',
    'tests',
    'test',
    'coverage',
  ]);

  constructor(
    private readonly rag: RagService,
    private readonly prisma: PrismaService,
    private readonly env: EnvConfig,
  ) {}

  // ── Public entry points ──────────────────────────────────────────────

  async indexCodebase(): Promise<void> {
    await this.runOnce(RagCollection.CODEBASE, async () => {
      const root = this.env.ecommerceRefPath;
      if (!root) {
        this.logger.warn('ECOMMERCE_REF_PATH is empty — skipping codebase indexing');
        return 0;
      }
      this.logger.log(`Indexing codebase from ${root}`);
      const chunks = await this.collectCodeChunks(root);
      await this.feedChunks(RagCollection.CODEBASE, chunks);
      return chunks.length;
    });
  }

  async indexLogs(): Promise<void> {
    await this.runOnce(RagCollection.LOGS, async () => {
      const root = this.env.logsPath;
      if (!root) {
        this.logger.warn('LOGS_PATH is empty — skipping logs indexing');
        return 0;
      }
      this.logger.log(`Indexing logs from ${root}`);
      const chunks = await this.collectLogChunks(root);
      await this.feedChunks(RagCollection.LOGS, chunks);
      return chunks.length;
    });
  }

  // ── Per-incident helper (called by IncidentsService on resolution) ───

  async indexIncident(args: {
    id: string;
    title: string;
    description: string;
    triageSummary?: string | null;
    resolutionNotes?: string | null;
  }): Promise<void> {
    const content = [
      `# ${args.title}`,
      args.description,
      args.triageSummary ? `## Triage\n${args.triageSummary}` : '',
      args.resolutionNotes ? `## Resolution\n${args.resolutionNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    await this.rag.upsertDocument(
      RagCollection.INCIDENTS,
      content,
      { incidentId: args.id },
      `incident:${args.id}`,
    );
  }

  // ── Private workflow ─────────────────────────────────────────────────

  private async runOnce(
    collection: RagCollection,
    work: () => Promise<number>,
  ): Promise<void> {
    const status = await this.prisma.indexingStatus.findUnique({
      where: { collection },
    });

    if (status?.status === IndexingState.DONE) {
      this.logger.log(`Collection ${collection} already indexed — skipping`);
      return;
    }

    await this.prisma.indexingStatus.upsert({
      where: { collection },
      update: { status: IndexingState.RUNNING },
      create: { collection, status: IndexingState.RUNNING },
    });

    try {
      const docCount = await work();
      await this.prisma.indexingStatus.update({
        where: { collection },
        data: {
          status: IndexingState.DONE,
          docCount,
          lastIndexed: new Date(),
        },
      });
      this.logger.log(`Collection ${collection} indexed (${docCount} chunks)`);
    } catch (err) {
      await this.prisma.indexingStatus.update({
        where: { collection },
        data: { status: IndexingState.FAILED },
      });
      this.logger.error(
        `Failed to index ${collection}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  private async feedChunks(
    collection: RagCollection,
    chunks: FileChunk[],
  ): Promise<void> {
    let processed = 0;
    for (const chunk of chunks) {
      try {
        await this.rag.upsertDocument(
          collection,
          chunk.content,
          chunk.metadata,
          chunk.source,
        );
        processed++;
        if (processed % 25 === 0) {
          this.logger.log(`${collection}: ${processed}/${chunks.length} chunks`);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to embed chunk ${chunk.source}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ── Collectors ───────────────────────────────────────────────────────

  private async collectCodeChunks(root: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    if (!(await this.pathExists(root))) {
      this.logger.warn(`Codebase path does not exist: ${root}`);
      return chunks;
    }

    const files = await this.walk(root);
    for (const file of files) {
      const ext = path.extname(file);
      if (!IndexerService.CODE_EXTENSIONS.has(ext)) continue;

      const content = await fs.readFile(file, 'utf8');
      const relative = path.relative(root, file);

      for (const slice of this.splitIntoChunks(content)) {
        chunks.push({
          source: relative,
          content: slice,
          metadata: { file: relative, ext },
        });
      }
    }
    return chunks;
  }

  private async collectLogChunks(root: string): Promise<FileChunk[]> {
    const chunks: FileChunk[] = [];
    if (!(await this.pathExists(root))) {
      this.logger.warn(`Logs path does not exist: ${root}`);
      return chunks;
    }

    const files = await this.walk(root);
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const content = await fs.readFile(file, 'utf8');
      const relative = path.relative(root, file);
      for (const slice of this.splitIntoChunks(content)) {
        chunks.push({
          source: relative,
          content: slice,
          metadata: { file: relative },
        });
      }
    }
    return chunks;
  }

  private async walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop()!;
      let entries;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (IndexerService.SKIP_DIRS.has(entry.name)) continue;
          stack.push(path.join(current, entry.name));
        } else if (entry.isFile()) {
          out.push(path.join(current, entry.name));
        }
      }
    }
    return out;
  }

  private splitIntoChunks(content: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += IndexerService.MAX_CHUNK_CHARS) {
      const slice = content.slice(i, i + IndexerService.MAX_CHUNK_CHARS).trim();
      if (slice.length > 0) chunks.push(slice);
    }
    return chunks;
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }
}
