import { describe, expect, it } from 'vitest';
import {
  FormDocumentSchema,
  compileFormStep,
  formStepCount,
  validateFormStepAnswers,
} from './forms.js';

describe('supported modal forms', () => {
  const form = {
    schemaVersion: 1,
    title: 'Tell us more',
    fields: Array.from({ length: 7 }, (_, i) => ({
      key: `answer_${i}`,
      label: `Question ${i + 1}`,
      maxLength: 100,
    })),
  };
  it('splits long forms into persisted steps of at most five Labels', () => {
    expect(formStepCount(form)).toBe(2);
    const first = compileFormStep(form, 0, 'spk:form:issued_actor_flow');
    const second = compileFormStep(form, 1, 'spk:form:issued_actor_flow');
    expect(first.components).toHaveLength(5);
    expect(second.components).toHaveLength(2);
    expect(first.components[0]).toMatchObject({
      type: 18,
      label: 'Question 1',
      component: {
        type: 4,
        custom_id: 'field:answer_0',
        style: 1,
        required: true,
      },
    });
  });
  it('rejects forged fields, missing required answers and answers beyond limits', () => {
    const answers = { answer_5: 'Hello', answer_6: 'World' };
    expect(validateFormStepAnswers(form, 1, answers)).toEqual(answers);
    expect(() =>
      validateFormStepAnswers(form, 1, { ...answers, forged: 'value' }),
    ).toThrow();
    expect(() =>
      validateFormStepAnswers(form, 1, {
        answer_5: '',
        answer_6: 'x'.repeat(101),
      }),
    ).toThrow();
    expect(() =>
      compileFormStep(form, 2, 'spk:form:issued_actor_flow'),
    ).toThrow(/does not exist/);
    expect(() => compileFormStep(form, 0, 'client_supplied_guild_id')).toThrow(
      /persisted actor-bound/,
    );
  });
  it('rejects duplicate field identities and impossible length rules', () => {
    expect(() =>
      FormDocumentSchema.parse({
        ...form,
        fields: [
          { key: 'same', label: 'A' },
          { key: 'same', label: 'B' },
        ],
      }),
    ).toThrow();
    expect(() =>
      FormDocumentSchema.parse({
        ...form,
        fields: [{ key: 'a', label: 'A', minLength: 100, maxLength: 10 }],
      }),
    ).toThrow();
  });
});
