import { z } from 'zod';

const fieldKey = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const FormDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(45),
    fields: z
      .array(
        z
          .object({
            key: fieldKey,
            label: z.string().min(1).max(45),
            description: z.string().max(100).optional(),
            style: z.enum(['short', 'paragraph']).default('short'),
            placeholder: z.string().max(100).optional(),
            required: z.boolean().default(true),
            minLength: z.number().int().min(0).max(4000).default(0),
            maxLength: z.number().int().min(1).max(4000).default(4000),
          })
          .strict(),
      )
      .min(1)
      .max(25),
  })
  .strict()
  .superRefine((form, ctx) => {
    const keys = new Set<string>();
    form.fields.forEach((field, i) => {
      if (keys.has(field.key))
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'key'],
          message: 'Form field keys must be unique.',
        });
      if (field.minLength > field.maxLength)
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'maxLength'],
          message: 'Maximum length must be at least the minimum length.',
        });
      keys.add(field.key);
    });
  });
export type FormDocument = z.infer<typeof FormDocumentSchema>;

export function formStepCount(input: unknown): number {
  return Math.ceil(FormDocumentSchema.parse(input).fields.length / 5);
}

/** Multi-step flow state and actor binding must be persisted by the caller. */
export function compileFormStep(
  input: unknown,
  step: number,
  issuedCustomId: string,
  answers: Readonly<Record<string, string>> = {},
): { title: string; custom_id: string; components: Record<string, unknown>[] } {
  const form = FormDocumentSchema.parse(input);
  if (!Number.isInteger(step) || step < 0 || step >= formStepCount(form))
    throw new Error('This form step does not exist.');
  if (
    !/^spk:form:[a-zA-Z0-9_-]+$/.test(issuedCustomId) ||
    issuedCustomId.length > 100
  )
    throw new Error('Issue a persisted actor-bound form identity.');
  const fields = form.fields.slice(step * 5, (step + 1) * 5);
  return {
    title: form.title,
    custom_id: issuedCustomId,
    components: fields.map((field) => {
      const saved = answers[field.key];
      if (saved !== undefined && saved.length > field.maxLength)
        throw new Error(`Saved answer for ${field.key} is too long.`);
      return {
        type: 18,
        label: field.label,
        ...(field.description ? { description: field.description } : {}),
        component: {
          type: 4,
          custom_id: `field:${field.key}`,
          style: field.style === 'short' ? 1 : 2,
          required: field.required,
          min_length: field.minLength,
          max_length: field.maxLength,
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
          ...(saved === undefined ? {} : { value: saved }),
        },
      };
    }),
  };
}

export function validateFormStepAnswers(
  input: unknown,
  step: number,
  answers: unknown,
): Record<string, string> {
  const form = FormDocumentSchema.parse(input);
  if (!Number.isInteger(step) || step < 0 || step >= formStepCount(form))
    throw new Error('This form step does not exist.');
  const shape: Record<string, z.ZodString> = {};
  for (const field of form.fields.slice(step * 5, (step + 1) * 5)) {
    shape[field.key] = z
      .string()
      .min(field.required ? Math.max(1, field.minLength) : field.minLength)
      .max(field.maxLength);
  }
  return z.object(shape).strict().parse(answers);
}
