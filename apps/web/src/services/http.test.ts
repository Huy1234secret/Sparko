import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { ApiError, http, isRetryable } from './http';

function failWith(status: number | null, data?: unknown, code?: string) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError(
        'request failed',
        code ?? (status ? 'ERR_BAD_REQUEST' : 'ECONNABORTED'),
        config,
        {},
        status === null
          ? undefined
          : {
              status,
              statusText: '',
              headers: {},
              config,
              data,
            },
      ),
    );
}
async function caught(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to fail.');
}

describe('typed API errors', () => {
  it('preserves validation field errors and the non-retryable flag', async () => {
    const error = await caught(
      http.put(
        '/x',
        {},
        {
          adapter: failWith(400, {
            error: {
              code: 'INVALID_INPUT',
              message: 'Check the highlighted fields.',
              fieldErrors: [
                { path: 'categories.0.name', message: 'Too short' },
              ],
              retryable: false,
            },
            requestId: 'req-1',
          }),
        },
      ),
    );
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.requestId).toBe('req-1');
    expect(apiError.fieldErrors).toEqual([
      { path: 'categories.0.name', message: 'Too short' },
    ]);
    expect(isRetryable(apiError)).toBe(false);
  });

  it('marks server-declared transient failures as retryable', async () => {
    const error = await caught(
      http.get('/x', {
        adapter: failWith(503, {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Retry with the same request key.',
            retryable: true,
          },
        }),
      }),
    );
    expect(isRetryable(error)).toBe(true);
    expect((error as ApiError).fieldErrors).toEqual([]);
  });

  it('treats lost connections as retryable but cancellations and unknown 4xx bodies as final', async () => {
    expect(
      isRetryable(await caught(http.get('/x', { adapter: failWith(null) }))),
    ).toBe(true);
    expect(
      isRetryable(
        await caught(
          http.get('/x', {
            adapter: failWith(null, undefined, 'ERR_CANCELED'),
          }),
        ),
      ),
    ).toBe(false);
    expect(
      isRetryable(
        await caught(http.get('/x', { adapter: failWith(404, 'nope') })),
      ),
    ).toBe(false);
    expect(
      isRetryable(
        await caught(http.get('/x', { adapter: failWith(502, '<html>') })),
      ),
    ).toBe(true);
  });
});
