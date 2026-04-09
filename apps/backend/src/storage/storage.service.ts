import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve, isAbsolute, join } from 'path';
import { EnvConfig } from '../config/env.config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storage: Storage | null;
  private readonly bucket: string | null;

  constructor(private readonly env: EnvConfig) {
    const creds = env.gcsCredentialsPath;
    const bucket = env.gcsBucketName;

    if (creds && bucket) {
      // resolve() uses cwd which may be the repo root or apps/backend/.
      // Try multiple candidate paths to find the credentials file.
      const candidates = isAbsolute(creds)
        ? [creds]
        : [
            resolve(creds),                             // from cwd
            resolve('apps/backend', creds),             // from repo root
            resolve(__dirname, '..', '..', creds),      // from dist/
            join(resolve('.'), '.keys', 'gcp-credentials.json'),
            join(resolve('.'), 'apps', 'backend', '.keys', 'gcp-credentials.json'),
          ];
      const resolvedPath = candidates.find((p) => existsSync(p));
      if (!resolvedPath) {
        this.storage = null;
        this.bucket = null;
        this.logger.warn(
          `GCS credentials file not found. Tried: ${candidates.join(', ')}`,
        );
        return;
      }
      this.storage = new Storage({
        projectId: env.gcpProjectId,
        keyFilename: resolvedPath,
      });
      this.bucket = bucket;
      this.logger.log(`GCS connected → bucket "${bucket}"`);
    } else {
      this.storage = null;
      this.bucket = null;
      this.logger.warn(
        'GCS not configured (missing GCP_BUCKET_NAME or GOOGLE_APPLICATION_CREDENTIALS). Attachments will not be uploaded.',
      );
    }
  }

  get isConfigured(): boolean {
    return this.storage !== null && this.bucket !== null;
  }

  /**
   * Uploads a base64-encoded file to GCS and returns its public URL.
   */
  async uploadBase64(args: {
    base64: string;
    mimeType: string;
    folder: string;
    originalName?: string;
  }): Promise<string> {
    if (!this.storage || !this.bucket) {
      throw new Error('GCS is not configured');
    }

    const ext = args.mimeType.split('/')[1] ?? 'bin';
    const fileName = `${args.folder}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(args.base64, 'base64');

    const file = this.storage.bucket(this.bucket).file(fileName);
    await file.save(buffer, {
      contentType: args.mimeType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    // Try to make public; if bucket policy blocks it, fall back to signed URL
    let url: string;
    try {
      await file.makePublic();
      url = `https://storage.googleapis.com/${this.bucket}/${fileName}`;
    } catch {
      const [signed] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      url = signed;
    }

    this.logger.log(`Uploaded ${fileName} (${buffer.length} bytes)`);
    return url;
  }
}
