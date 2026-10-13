import type { IncomingMessage, ServerResponse } from 'node:http';

/** Small helpers shared by the API routes. */
export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

export function redirect(
  res: ServerResponse,
  to: string,
  setCookie?: string[],
) {
  res.writeHead(302, {
    Location: to,
    'Cache-Control': 'no-store',
    ...(setCookie ? { 'Set-Cookie': setCookie } : {}),
  });
  res.end();
}

export function cookies(req: IncomingMessage) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0)
      out[part.slice(0, at).trim()] = decodeURIComponent(
        part.slice(at + 1).trim(),
      );
  }
  return out;
}

export class BadRequest extends Error {}

/** Reads a JSON body of at most `limit` bytes. */
export async function readJson<T>(req: IncomingMessage, limit = 256_000) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new BadRequest('That request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') as T;
  } catch {
    throw new BadRequest('That request wasn’t valid JSON.');
  }
}
