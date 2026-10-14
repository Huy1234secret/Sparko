/** A small Discord REST client with rate-limit retries. */
export class DiscordError extends Error {
  readonly status: number;
  readonly code: number;
  constructor(status: number, code: number, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Discord error codes Sparko explains to people. */
export const DiscordCodes = {
  unknownChannel: 10003,
  unknownMessage: 10008,
  missingAccess: 50001,
  missingPermissions: 50013,
  cannotEditOthers: 50005,
} as const;

export type Rest = ReturnType<typeof discordRest>;

export function discordRest({
  token,
  fetch: http = fetch,
  base = 'https://discord.com/api/v10',
}: {
  token: string;
  fetch?: typeof fetch;
  base?: string;
}) {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    reason?: string,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await http(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(reason
            ? { 'X-Audit-Log-Reason': encodeURIComponent(reason) }
            : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 429 && attempt < 3) {
        const info = (await res.json().catch(() => ({}))) as {
          retry_after?: number;
        };
        await new Promise((done) =>
          setTimeout(done, Math.min(5, info.retry_after ?? 1) * 1000),
        );
        continue;
      }
      if (res.status === 204) return undefined as T;
      const data = (await res.json().catch(() => ({}))) as {
        code?: number;
        message?: string;
      };
      if (!res.ok)
        throw new DiscordError(
          res.status,
          data.code ?? 0,
          data.message ?? `Discord answered ${res.status}`,
        );
      return data as T;
    }
  }
  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown, reason?: string) =>
      request<T>('POST', path, body, reason),
    patch: <T>(path: string, body: unknown, reason?: string) =>
      request<T>('PATCH', path, body, reason),
    put: <T>(path: string, body: unknown, reason?: string) =>
      request<T>('PUT', path, body, reason),
    delete: <T>(path: string, reason?: string) =>
      request<T>('DELETE', path, undefined, reason),
  };
}
