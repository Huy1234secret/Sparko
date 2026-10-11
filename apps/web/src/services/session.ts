import { z } from 'zod';
import { PreferenceSchema } from '@sparko/contracts';
import { isAuthError, mutate, mutationIdentity, read, setCsrfToken } from './http';

export const PreferencesSchema = PreferenceSchema;
export const UserSchema = z.object({ id: z.string(), username: z.string(), avatarUrl: z.string().nullable().optional(), displayName: z.string().nullable().optional() });
export const SessionSchema = z.object({ user: UserSchema.nullable(), csrfToken: z.string().optional(), capabilities: z.array(z.string()).default([]), preferences: PreferencesSchema.optional() });
export type Session = z.infer<typeof SessionSchema>;
export async function getSession(signal?: AbortSignal) { try { const session = await read('/session', SessionSchema, signal); setCsrfToken(session.csrfToken ?? null); return session; } catch (error) { if (isAuthError(error)) { setCsrfToken(null); return { user: null, capabilities: [] } satisfies Session; } throw error; } }
export function logout(key = mutationIdentity()) { return mutate('post', '/session/logout', {}, z.unknown(), key); }
export function savePreferences(preferences: z.infer<typeof PreferencesSchema>, key: string) { return mutate('put', '/account/preferences', preferences, PreferencesSchema, key); }
export const loginUrl = (returnTo = '/dashboard') => `/api/v1/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
