import axios, { AxiosError } from 'axios';
import { z } from 'zod';

const ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    currentRevision: z.number().optional(),
    fieldErrors: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
    retryable: z.boolean().optional(),
  }),
  requestId: z.string().optional(),
});
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly currentRevision: number | undefined;
  constructor(
    message: string,
    code: string,
    status: number,
    requestId?: string,
    currentRevision?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.currentRevision = currentRevision;
  }
}
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});
http.interceptors.request.use((config) => {
  if (
    csrfToken &&
    config.method &&
    !['get', 'head', 'options'].includes(config.method)
  )
    config.headers.set('X-CSRF-Token', csrfToken);
  return config;
});
http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const parsed = ErrorSchema.safeParse(error.response?.data);
      if (parsed.success)
        return Promise.reject(
          new ApiError(
            parsed.data.error.message,
            parsed.data.error.code,
            error.response?.status ?? 0,
            parsed.data.requestId,
            parsed.data.error.currentRevision,
          ),
        );
      return Promise.reject(
        new ApiError(
          error.code === 'ERR_CANCELED'
            ? 'Request cancelled.'
            : error.response
              ? 'The service returned an unexpected response. Try again.'
              : 'Unable to reach Sparko. Check your connection and try again.',
          error.code ?? 'SERVICE_UNAVAILABLE',
          error.response?.status ?? 0,
        ),
      );
    }
    return Promise.reject(error);
  },
);
export const OperationSchema = z.object({
  id: z.string(),
  businessStatus: z.string(),
  deliveryStatus: z.string(),
  error: z.string().nullable().optional(),
});
export type Operation = z.infer<typeof OperationSchema>;
export function envelope<T extends z.ZodType>(schema: T) {
  return z.object({
    data: schema,
    operation: OperationSchema.optional(),
    requestId: z.string().optional(),
  });
}
const RawEnvelopeSchema = z.object({
  data: z.unknown(),
  operation: OperationSchema.optional(),
  requestId: z.string().optional(),
});
export async function read<T extends z.ZodType>(
  path: string,
  schema: T,
  signal?: AbortSignal,
): Promise<z.output<T>> {
  const response = await http.get<unknown>(path, {
    ...(signal ? { signal } : {}),
  });
  return schema.parse(RawEnvelopeSchema.parse(response.data).data);
}
export async function mutate<T extends z.ZodType>(
  method: 'post' | 'put' | 'delete',
  path: string,
  body: unknown,
  schema: T,
  key: string,
): Promise<{ data: z.output<T>; operation?: Operation | undefined }> {
  const response = await http.request<unknown>({
    method,
    url: path,
    data: body,
    headers: { 'Idempotency-Key': key },
  });
  const parsed = RawEnvelopeSchema.parse(response.data);
  return { data: schema.parse(parsed.data), operation: parsed.operation };
}
export function mutationIdentity() {
  return crypto.randomUUID();
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Try again.';
}
export function isAuthError(error: unknown) {
  return (
    (error instanceof ApiError && error.status === 401) ||
    (error instanceof AxiosError && error.response?.status === 401)
  );
}
