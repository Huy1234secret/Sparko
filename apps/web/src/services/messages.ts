import { z } from 'zod';
import { MessageDocumentSchema, type MessageDocument } from '@sparko/messages';
import { mutate, read } from './http';

export const TemplateVersionSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  number: z.number(),
  document: MessageDocumentSchema,
  createdAt: z.string(),
});
export const TemplateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    revision: z.number(),
    versions: z.array(TemplateVersionSchema).default([]),
    createdAt: z.string().optional(),
  })
  .transform((template) => ({
    ...template,
    latestVersionId: template.versions[0]?.id,
    document: template.versions[0]?.document,
  }));
export const PublicationSchema = z
  .object({
    id: z.string(),
    channelId: z.string(),
    messageId: z.string().nullable().optional(),
    templateVersionId: z.string().nullable().optional(),
    state: z.string(),
    document: MessageDocumentSchema.optional(),
    revision: z.number(),
    appliedRevision: z.number(),
    test: z.boolean(),
    createdAt: z.string(),
  })
  .transform((publication) => ({
    ...publication,
    status: publication.state,
    deliveryStatus: publication.state,
  }));
export type Publication = z.infer<typeof PublicationSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export const getTemplates = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/templates`, z.array(TemplateSchema), signal);
export const createTemplate = (
  guild: string,
  document: MessageDocument,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/templates`,
    { name: document.name, document },
    TemplateSchema,
    key,
  );
export async function createVersion(
  guild: string,
  template: Template,
  document: MessageDocument,
  key: string,
) {
  const result = await mutate(
    'post',
    `/guilds/${guild}/templates/${template.id}/versions`,
    { expectedRevision: template.revision, document },
    TemplateVersionSchema,
    key,
  );
  return {
    ...result,
    data: {
      ...template,
      revision: result.data.number,
      versions: [result.data],
      latestVersionId: result.data.id,
      document: result.data.document,
    },
  };
}
export const publishMessage = (
  guild: string,
  body: {
    channelId: string;
    document?: MessageDocument;
    templateVersionId?: string;
    purpose?: string;
  },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/messages/publish`,
    body,
    PublicationSchema,
    key,
  );
export const testMessage = (
  guild: string,
  body: { channelId: string; document: MessageDocument },
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/messages/test`,
    body,
    PublicationSchema,
    key,
  );
export const getPublications = (guild: string, signal?: AbortSignal) =>
  read(`/guilds/${guild}/publications`, z.array(PublicationSchema), signal);
export const archivePublication = (
  guild: string,
  id: string,
  expectedRevision: number,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/publications/${id}/archive`,
    { expectedRevision },
    PublicationSchema,
    key,
  );
export const getOperation = (guild: string, id: string, signal?: AbortSignal) =>
  read(
    `/guilds/${guild}/operations/${id}`,
    z.object({
      id: z.string(),
      kind: z.string().optional(),
      businessStatus: z.string(),
      deliveryStatus: z.string(),
      error: z.string().nullable().optional(),
      createdAt: z.string().optional(),
    }),
    signal,
  );
export const retryOperation = (guild: string, id: string, key: string) =>
  mutate(
    'post',
    `/guilds/${guild}/operations/${id}/retry`,
    {},
    z.unknown(),
    key,
  );

export const updatePublication = (
  guild: string,
  publication: Publication,
  document: MessageDocument,
  replace: boolean,
  key: string,
) =>
  mutate(
    'post',
    `/guilds/${guild}/publications/${publication.id}/update`,
    { expectedRevision: publication.revision, document, replace },
    PublicationSchema,
    key,
  );
