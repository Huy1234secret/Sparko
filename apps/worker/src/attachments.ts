import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DomainError } from '@sparko/contracts';
import type { PrismaClient } from '@sparko/db';
import { jsonObject } from '@sparko/domain';
import type { DiscordFile } from './discord.js';

export function publicationAssetIds(document: unknown): string[] {
  if (Array.isArray(document))
    return [...new Set(document.flatMap(publicationAssetIds))];
  if (typeof document === 'string' && document.startsWith('attachment://')) {
    const match =
      /^attachment:\/\/sparko-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.png$/i.exec(
        document,
      );
    if (!match?.[1])
      throw new DomainError(
        'INVALID_INPUT',
        'Choose a normalized image from this server’s asset library.',
      );
    return [match[1]];
  }
  if (!document || typeof document !== 'object') return [];
  return [...new Set(Object.values(document).flatMap(publicationAssetIds))];
}

/** Uploads are sanitized by the API; publication rechecks ownership and the actual retained bytes. */
export async function publicationFiles(
  db: PrismaClient,
  guildId: string,
  document: unknown,
  storagePath = process.env['STORAGE_PATH'] ?? '.data/private',
): Promise<DiscordFile[]> {
  const ids = publicationAssetIds(document);
  if (!ids.length) return [];
  if (ids.length > 10)
    throw new DomainError(
      'INVALID_INPUT',
      'A message can attach at most ten library images.',
    );
  const records = await db.record.findMany({
    where: { guildId, kind: 'asset', id: { in: ids }, state: 'clean' },
  });
  let bytes = 0;
  const files: DiscordFile[] = [];
  for (const id of ids) {
    const record = records.find((row) => row.id === id);
    const data = jsonObject(record?.data);
    if (
      !record ||
      data['visibility'] !== 'public' ||
      data['mime'] !== 'image/png' ||
      typeof data['hash'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data['hash'])
    )
      throw new DomainError(
        'FORBIDDEN',
        'This image is private, unavailable, or belongs to another server.',
        403,
      );
    const path = resolve(storagePath, 'assets', `${data['hash']}.png`);
    const metadata = await stat(path).catch(() => {
      throw new DomainError(
        'NOT_FOUND',
        'A retained library image is unavailable.',
        404,
      );
    });
    if (
      !metadata.isFile() ||
      metadata.size > 4 * 1024 * 1024 ||
      metadata.size !== data['bytes']
    )
      throw new DomainError(
        'INVALID_INPUT',
        'A library image failed its upload-size check.',
      );
    const file = await readFile(path).catch(() => {
      throw new DomainError(
        'NOT_FOUND',
        'A retained library image is unavailable.',
        404,
      );
    });
    bytes += file.length;
    if (
      file.length < 24 ||
      file.length !== data['bytes'] ||
      file.length > 4 * 1024 * 1024 ||
      bytes > 10 * 1024 * 1024 ||
      !file
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      file.readUInt32BE(16) !== data['width'] ||
      file.readUInt32BE(20) !== data['height'] ||
      file.readUInt32BE(16) * file.readUInt32BE(20) > 4_000_000 ||
      createHash('sha256').update(file).digest('hex') !== data['hash']
    )
      throw new DomainError(
        'INVALID_INPUT',
        'A library image failed its integrity or upload-size check.',
      );
    files.push({
      name: `sparko-${id}.png`,
      data: file,
      contentType: 'image/png',
    });
  }
  return files;
}
