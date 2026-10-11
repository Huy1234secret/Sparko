import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

/** Verify format and hash without loading an operator's entire database into memory. */
export async function archiveChecksum(file: string): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const magic = Buffer.alloc(5);
    await handle.read(magic, 0, 5, 0);
    if (magic.toString() !== 'PGDMP')
      throw new Error('Archive must use PostgreSQL custom format.');
  } finally {
    await handle.close();
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
