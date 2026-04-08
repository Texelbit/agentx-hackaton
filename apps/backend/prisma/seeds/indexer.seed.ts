/**
 * Indexer seed — one-shot codebase + logs indexing into pgvector.
 *
 * Boots a minimal Nest application context (no HTTP listener) so the seed
 * can reuse `IndexerService` with all its dependencies (RagService,
 * EnvConfig, LlmClient, PrismaService).
 *
 * Run with: `npm run seed:indexer`
 */
// MUST be the first import — populates process.env from the repo-root .env
// before NestFactory boots the app and Joi validates env vars.
import './_load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { IndexerService } from '../../src/rag/indexer.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const indexer = app.get(IndexerService);
    console.log('[indexer-seed] indexing codebase…');
    await indexer.indexCodebase();
    console.log('[indexer-seed] indexing logs…');
    await indexer.indexLogs();
    console.log('[indexer-seed] done');
  } catch (err) {
    console.error('[indexer-seed] FAILED:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main();
