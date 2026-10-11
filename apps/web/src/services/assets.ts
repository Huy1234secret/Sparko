import { z } from 'zod';
import { mutate, read } from './http';
export const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  alt: z.string(),
  width: z.number(),
  height: z.number(),
  bytes: z.number(),
  mime: z.literal('image/png'),
  url: z.string(),
  previewUrl: z.string(),
  visibility: z.enum(['public', 'private']),
});
export type MediaAsset = z.infer<typeof AssetSchema>;
export const getAssets = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/assets`, z.array(AssetSchema), signal);
export const uploadAsset = (
  guild: string,
  input: {
    name: string;
    alt: string;
    base64: string;
    visibility: 'public' | 'private';
    publicSharingAcknowledged: boolean;
  },
  key: string,
) => mutate('post', `/guilds/${guild}/assets`, input, AssetSchema, key);
export async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
