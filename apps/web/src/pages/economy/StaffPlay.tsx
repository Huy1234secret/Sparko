import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Award,
  Brain,
  Hammer,
  Plus,
  Ticket,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { Tabs } from '../../features/config/Tabs';
import {
  NumberField,
  SwitchField,
  fieldError,
} from '../../features/config/fields';
import {
  AutomationSettings,
  OffNotice,
} from '../../features/automation/shared';
import {
  DurationField,
  ItemSelect,
  UnitsField,
  useShopItems,
} from '../../features/economy/fields';
import {
  EconomyState,
  PositiveUnitsInput,
  Units,
  UnitsInput,
  useRefreshEconomy,
} from '../../features/economy/shared';
import {
  archiveSeason,
  cancelLottery,
  createAchievement,
  createLottery,
  createRecipe,
  getAchievements,
  getCollections,
  getLotteries,
  getQuestions,
  getSeasonBoard,
  getSeasons,
  saveQuestion,
  startSeason,
  type LotteryView,
  type SeasonView,
} from '../../services/economy';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';

const Slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,40}$/, 'Use lowercase letters, numbers and dashes.');
const Reason = z.string().trim().min(3, 'Record why.').max(500);
const futureLocal = z
  .string()
  .min(1, 'Choose a time.')
  .refine((v) => new Date(v).getTime() > Date.now(), 'Choose a future time.');

// Collections (R55)
function DropsEditor({
  form,
  guildId,
}: {
  form: Parameters<
    NonNullable<Parameters<typeof AutomationSettings>[0]['children']>
  >[0];
  guildId: string;
}) {
  const drops = useFieldArray({
    control: form.control as never,
    name: 'drops' as never,
  });
  const weights =
    (form.watch('drops') as { weight?: number }[] | undefined) ?? [];
  const total = weights.reduce((n, d) => n + (Number(d.weight) || 0), 0);
  return (
    <fieldset className="stack">
      <legend>What a hunt can find</legend>
      <p className="field-hint">
        Only collectibles can drop. Each find’s chance is its weight divided by
        the total; members see the resulting percentages.
      </p>
      {drops.fields.map((row, index) => (
        <div className="row" key={row.id}>
          <ItemSelect
            form={form}
            name={`drops.${index}.itemId`}
            label={`Find ${index + 1}`}
            guildId={guildId}
            type="collectible"
          />
          <NumberField
            form={form}
            name={`drops.${index}.weight`}
            label="Weight"
            min={1}
            {...(total
              ? {
                  hint: `${Math.round(((Number(weights[index]?.weight) || 0) / total) * 100)}% chance`,
                }
              : {})}
          />
          <NumberField
            form={form}
            name={`drops.${index}.quantity`}
            label="Quantity"
            min={1}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove find ${index + 1}`}
            onClick={() => drops.remove(index)}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <div className="row">
        <Button
          type="button"
          variant="secondary"
          disabled={drops.fields.length >= 50}
          onClick={() =>
            drops.append({ itemId: '', weight: 10, quantity: 1 } as never)
          }
        >
          <Plus size={16} /> Add a find
        </Button>
      </div>
    </fieldset>
  );
}

const RecipeForm = z
  .object({
    recipeId: Slug,
    name: z.string().trim().min(1, 'Name the recipe.').max(80),
    ingredients: z
      .array(
        z.object({
          itemId: z.string().min(1, 'Choose an item.'),
          quantity: z.number().int().min(1).max(1_000_000),
        }),
      )
      .min(1, 'Add at least one ingredient.')
      .max(20),
    resultItemId: z.string().min(1, 'Choose what it makes.'),
    resultQuantity: z.number().int().min(1).max(1_000_000),
    cost: UnitsInput,
  })
  .refine(
    (v) =>
      new Set(v.ingredients.map((i) => i.itemId)).size === v.ingredients.length,
    { path: ['ingredients'], message: 'List each ingredient once.' },
  );
function NewRecipe({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const form = useForm<z.input<typeof RecipeForm>>({
    resolver: zodResolver(RecipeForm),
    defaultValues: {
      recipeId: '',
      name: '',
      ingredients: [{ itemId: '', quantity: 1 }],
      resultItemId: '',
      resultQuantity: 1,
      cost: '0',
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'ingredients' });
  const create = useMutation({
    mutationFn: (values: z.output<typeof RecipeForm>) =>
      createRecipe(guildId, values, identity('recipe', values)),
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  const errors = form.formState.errors;
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <h2>New recipe</h2>
        <div className="overview-grid">
          <Field
            label="Name"
            htmlFor="recipe-name"
            error={errors.name?.message}
          >
            <Input id="recipe-name" {...form.register('name')} />
          </Field>
          <Field
            label="Recipe ID"
            htmlFor="recipe-id"
            hint="Permanent."
            error={errors.recipeId?.message}
          >
            <Input id="recipe-id" {...form.register('recipeId')} />
          </Field>
        </div>
        <fieldset className="stack">
          <legend>Ingredients (used up)</legend>
          {lines.fields.map((line, index) => (
            <div className="row" key={line.id}>
              <ItemSelect
                form={form as never}
                name={`ingredients.${index}.itemId`}
                label={`Ingredient ${index + 1}`}
                guildId={guildId}
              />
              <NumberField
                form={form as never}
                name={`ingredients.${index}.quantity`}
                label="Quantity"
                min={1}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ingredient ${index + 1}`}
                disabled={lines.fields.length === 1}
                onClick={() => lines.remove(index)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          {fieldError(form as never, 'ingredients') && (
            <p className="field-error" role="alert">
              {fieldError(form as never, 'ingredients')}
            </p>
          )}
          <div className="row">
            <Button
              type="button"
              variant="secondary"
              disabled={lines.fields.length >= 20}
              onClick={() => lines.append({ itemId: '', quantity: 1 })}
            >
              <Plus size={16} /> Add an ingredient
            </Button>
          </div>
        </fieldset>
        <div className="overview-grid">
          <ItemSelect
            form={form as never}
            name="resultItemId"
            label="Makes"
            guildId={guildId}
            hint="Discord role items can’t be crafted."
          />
          <NumberField
            form={form as never}
            name="resultQuantity"
            label="How many"
            min={1}
          />
          <UnitsField
            form={form as never}
            name="cost"
            label="Crafting fee"
            hint="0 for free."
          />
        </div>
        <div className="row">
          <Button type="submit" busy={create.isPending}>
            <Hammer size={16} /> Add recipe
          </Button>
        </div>
        {create.error && <ErrorState message={errorMessage(create.error)} />}
      </form>
    </Card>
  );
}
function Recipes({ guildId }: { guildId: string }) {
  const collections = useQuery({
    queryKey: ['economy', guildId, 'collections'],
    queryFn: ({ signal }) => getCollections(guildId, signal),
  });
  return (
    <div className="stack">
      {collections.isPending ? (
        <LoadingState />
      ) : collections.error ? (
        <ErrorState message={errorMessage(collections.error)} />
      ) : collections.data.recipes.length ? (
        <Card>
          <h2>Recipes</h2>
          <ul className="row-list">
            {collections.data.recipes.map((recipe) => (
              <li className="activity-row" key={recipe.id}>
                <span>
                  <strong className="wrap-anywhere">{recipe.name}</strong>
                  <small>
                    {recipe.ingredients
                      .map((i) => `${i.name} × ${i.quantity}`)
                      .join(' + ')}{' '}
                    → {recipe.result.name} × {recipe.result.quantity}
                    {recipe.cost !== '0' && ` · fee ${recipe.cost}`}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={Hammer}
          title="No recipes yet"
          description="Recipes turn collected items into rarer ones."
        />
      )}
      <NewRecipe guildId={guildId} />
    </div>
  );
}

export function CollectionsPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Collections"
        description="Members hunt for collectibles with published odds and combine them with recipes."
      />
      <OffNotice guildId={guildId} featureId="R55" noun="Collections" />
      <Tabs
        tabs={[
          {
            id: 'recipes',
            label: 'Recipes',
            content: <Recipes guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Hunting & settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R55"
                title="Hunting"
                description="Collectibles come from the shop’s item list. Odds apply to every member equally."
                enableLabel="Turn on collections"
              >
                {(form) => (
                  <>
                    <div className="overview-grid">
                      <DurationField
                        form={form}
                        name="huntCooldownSeconds"
                        label="Time between hunts"
                        unit="minutes"
                      />
                      <NumberField
                        form={form}
                        name="huntsPerDay"
                        label="Hunts per member per day"
                        min={1}
                        max={100}
                      />
                    </div>
                    <DropsEditor form={form} guildId={guildId} />
                  </>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

// Trivia (R56)
const QuestionForm = z
  .object({
    questionId: Slug,
    question: z.string().trim().min(1, 'Write the question.').max(1000),
    choices: z
      .array(
        z.object({
          label: z.string().trim().min(1, 'Fill in this choice.').max(200),
        }),
      )
      .min(2)
      .max(6),
    correctIndex: z.number().int().min(0),
  })
  .refine((v) => v.correctIndex < v.choices.length, {
    path: ['correctIndex'],
    message: 'Mark the right answer.',
  });
type QuestionInput = z.input<typeof QuestionForm>;
const blankQuestion: QuestionInput = {
  questionId: '',
  question: '',
  choices: [{ label: '' }, { label: '' }],
  correctIndex: 0,
};
function QuestionEditor({
  guildId,
  initial,
  onDone,
}: {
  guildId: string;
  initial: QuestionInput;
  onDone: () => void;
}) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const form = useForm<QuestionInput, unknown, z.output<typeof QuestionForm>>({
    resolver: zodResolver(QuestionForm),
    defaultValues: initial,
  });
  const choices = useFieldArray({ control: form.control, name: 'choices' });
  const correct = form.watch('correctIndex');
  const save = useMutation({
    mutationFn: (v: z.output<typeof QuestionForm>) => {
      const body = {
        questionId: v.questionId,
        question: v.question,
        choices: v.choices.map((c) => c.label),
        correctIndex: v.correctIndex,
      };
      return saveQuestion(guildId, body, identity('question', body));
    },
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  const errors = form.formState.errors;
  const editing = !!initial.questionId;
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <h2>{editing ? 'Edit question' : 'New question'}</h2>
        <Field
          label="Question"
          htmlFor="q-text"
          error={errors.question?.message}
        >
          <Input id="q-text" {...form.register('question')} />
        </Field>
        <Field
          label="Question ID"
          htmlFor="q-id"
          hint={
            editing
              ? 'Saving replaces this question for future games.'
              : 'Permanent; reuse it to replace the question later.'
          }
          error={errors.questionId?.message}
        >
          <Input
            id="q-id"
            readOnly={editing}
            {...form.register('questionId')}
          />
        </Field>
        <fieldset className="stack">
          <legend>Choices — mark the right one</legend>
          {choices.fields.map((choice, index) => (
            <div className="row" key={choice.id}>
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="correct-choice"
                  checked={correct === index}
                  onChange={() => form.setValue('correctIndex', index)}
                  aria-label={`Choice ${index + 1} is correct`}
                />
              </label>
              <Field
                label={`Choice ${index + 1}`}
                htmlFor={`q-choice-${index}`}
                error={errors.choices?.[index]?.label?.message}
              >
                <Input
                  id={`q-choice-${index}`}
                  {...form.register(`choices.${index}.label`)}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove choice ${index + 1}`}
                disabled={choices.fields.length <= 2}
                onClick={() => {
                  choices.remove(index);
                  if (correct >= index && correct > 0)
                    form.setValue('correctIndex', correct - 1);
                }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          {errors.correctIndex?.message && (
            <p className="field-error" role="alert">
              {errors.correctIndex.message}
            </p>
          )}
          <div className="row">
            <Button
              type="button"
              variant="secondary"
              disabled={choices.fields.length >= 6}
              onClick={() => choices.append({ label: '' })}
            >
              <Plus size={16} /> Add a choice
            </Button>
          </div>
        </fieldset>
        <p className="field-hint">
          Members never see which choice is right until they answer.
        </p>
        <div className="row">
          <Button type="submit" busy={save.isPending}>
            <Brain size={16} /> Save question
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
        {save.error && <ErrorState message={errorMessage(save.error)} />}
      </form>
    </Card>
  );
}
function Questions({ guildId }: { guildId: string }) {
  const [editing, setEditing] = useState<QuestionInput | null>(null);
  const questions = useQuery({
    queryKey: ['economy', guildId, 'questions'],
    queryFn: ({ signal }) => getQuestions(guildId, signal),
  });
  if (editing)
    return (
      <QuestionEditor
        guildId={guildId}
        initial={editing}
        onDone={() => setEditing(null)}
      />
    );
  return (
    <div className="stack">
      {questions.isPending ? (
        <LoadingState />
      ) : questions.error ? (
        <ErrorState message={errorMessage(questions.error)} />
      ) : questions.data.length ? (
        <Card>
          <h2>Question bank ({questions.data.length})</h2>
          <ul className="row-list">
            {questions.data.map((row) => (
              <li className="activity-row" key={row.id}>
                <span>
                  <strong className="wrap-anywhere">{row.data.question}</strong>
                  <small>
                    Answer: {row.data.choices[row.data.correctIndex]} ·{' '}
                    {row.data.choices.length} choices
                  </small>
                </span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEditing({
                      questionId: row.data.questionId,
                      question: row.data.question,
                      choices: row.data.choices.map((label) => ({ label })),
                      correctIndex: row.data.correctIndex,
                    })
                  }
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={Brain}
          title="No questions yet"
          description="Games pick a random question from this bank."
        />
      )}
      <QuestionEditor
        key={questions.data?.length ?? 0}
        guildId={guildId}
        initial={blankQuestion}
        onDone={() => undefined}
      />
    </div>
  );
}

export function GamesPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Trivia"
        description="Members answer one question at a time against the clock; a correct answer pays once."
      />
      <OffNotice guildId={guildId} featureId="R56" noun="Games" />
      <Tabs
        tabs={[
          {
            id: 'questions',
            label: 'Questions',
            content: <Questions guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R56"
                title="Trivia"
                description="Starting a game uses one play, even if the member doesn’t answer in time."
                enableLabel="Turn on trivia"
              >
                {(form) => (
                  <div className="overview-grid">
                    <NumberField
                      form={form}
                      name="playsPerDay"
                      label="Plays per member per day"
                      min={1}
                      max={100}
                    />
                    <DurationField
                      form={form}
                      name="cooldownSeconds"
                      label="Time between plays"
                      unit="minutes"
                    />
                    <NumberField
                      form={form}
                      name="answerSeconds"
                      label="Time to answer"
                      unit="seconds"
                      min={10}
                      max={300}
                    />
                    <UnitsField
                      form={form}
                      name="reward"
                      label="Reward for a right answer"
                    />
                    <NumberField
                      form={form}
                      name="xp"
                      label="XP for a right answer"
                      min={0}
                    />
                  </div>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

// Lottery (R67)
const LotteryForm = z.object({
  name: z.string().trim().min(1, 'Name the draw.').max(80),
  ticketPrice: PositiveUnitsInput,
  endsAtLocal: futureLocal,
  maxTicketsPerMember: z.number().int().min(1).max(1000),
  maxTotalTickets: z.number().int().min(1).max(1_000_000),
});
function NewLottery({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const form = useForm<z.input<typeof LotteryForm>>({
    resolver: zodResolver(LotteryForm),
    defaultValues: {
      name: '',
      ticketPrice: '10',
      endsAtLocal: '',
      maxTicketsPerMember: 5,
      maxTotalTickets: 1000,
    },
  });
  const create = useMutation({
    mutationFn: ({ endsAtLocal, ...rest }: z.output<typeof LotteryForm>) => {
      const body = { ...rest, endsAt: new Date(endsAtLocal).toISOString() };
      return createLottery(guildId, body, identity('lottery', body));
    },
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  const errors = form.formState.errors;
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <h2>New draw</h2>
        <p className="muted">
          The rules are published when you create the draw and can’t change
          afterwards. The whole pot goes to one ticket picked at random.
        </p>
        <div className="overview-grid">
          <Field label="Name" htmlFor="lot-name" error={errors.name?.message}>
            <Input id="lot-name" {...form.register('name')} />
          </Field>
          <Field
            label="Ticket price"
            htmlFor="lot-price"
            error={errors.ticketPrice?.message}
          >
            <Input
              id="lot-price"
              inputMode="numeric"
              {...form.register('ticketPrice')}
            />
          </Field>
          <Field
            label="Draws at"
            htmlFor="lot-ends"
            hint="Within 7 days."
            error={errors.endsAtLocal?.message}
          >
            <Input
              id="lot-ends"
              type="datetime-local"
              {...form.register('endsAtLocal')}
            />
          </Field>
          <NumberField
            form={form as never}
            name="maxTicketsPerMember"
            label="Tickets per member"
            min={1}
          />
          <NumberField
            form={form as never}
            name="maxTotalTickets"
            label="Tickets in total"
            min={1}
          />
        </div>
        <div className="row">
          <Button type="submit" busy={create.isPending}>
            <Ticket size={16} /> Publish draw
          </Button>
        </div>
        {create.error && <ErrorState message={errorMessage(create.error)} />}
      </form>
    </Card>
  );
}
function LotteryRow({
  guildId,
  lottery,
}: {
  guildId: string;
  lottery: LotteryView;
}) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: () =>
      cancelLottery(
        guildId,
        lottery.id,
        reason.trim(),
        identity('cancel', lottery.id),
      ),
    onSuccess: refresh,
  });
  return (
    <li className="activity-row">
      <span>
        <strong className="wrap-anywhere">{lottery.name}</strong>
        <small>
          <Units value={lottery.ticketPrice} /> a ticket ·{' '}
          {lottery.totalTickets}/{lottery.maxTotalTickets} sold · pot{' '}
          <Units value={lottery.pot} /> · draws{' '}
          {new Date(lottery.endsAt).toLocaleString()}
          {lottery.winnerId && ` · won by ${lottery.winnerId}`}
        </small>
      </span>
      <span className="row">
        <EconomyState state={lottery.state} />
        {lottery.state === 'open' && !open && (
          <Button variant="ghost" onClick={() => setOpen(true)}>
            Cancel draw…
          </Button>
        )}
      </span>
      {lottery.state === 'open' && open && (
        <form
          className="row policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (Reason.safeParse(reason).success) cancel.mutate();
          }}
        >
          <Field
            label="Reason (recorded); every ticket is refunded"
            htmlFor={`lot-cancel-${lottery.id}`}
          >
            <Input
              id={`lot-cancel-${lottery.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="danger"
            disabled={!Reason.safeParse(reason).success}
            busy={cancel.isPending}
          >
            Cancel and refund
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Keep it
          </Button>
        </form>
      )}
      {cancel.error && <ErrorState message={errorMessage(cancel.error)} />}
    </li>
  );
}
function Draws({ guildId }: { guildId: string }) {
  const lotteries = useQuery({
    queryKey: ['economy', guildId, 'lotteries'],
    queryFn: ({ signal }) => getLotteries(guildId, signal),
  });
  return (
    <div className="stack">
      {lotteries.isPending ? (
        <LoadingState />
      ) : lotteries.error ? (
        <ErrorState message={errorMessage(lotteries.error)} />
      ) : lotteries.data.length ? (
        <Card>
          <ul className="row-list">
            {lotteries.data.map((lottery) => (
              <LotteryRow
                key={lottery.id}
                guildId={guildId}
                lottery={lottery}
              />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={Ticket}
          title="No draws yet"
          description="Acknowledge the virtual-only rules in Settings, then publish a draw."
        />
      )}
      <NewLottery guildId={guildId} />
    </div>
  );
}
export function LotteryPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Virtual lottery"
        description="Draws paid for and won in virtual currency only. Members opt in for every entry."
      />
      <OffNotice guildId={guildId} featureId="R67" noun="Draws" />
      <Tabs
        tabs={[
          { id: 'draws', label: 'Draws', content: <Draws guildId={guildId} /> },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R67"
                title="Lottery rules"
                description="Every draw must fit inside these limits."
                enableLabel="Allow virtual draws"
              >
                {(form) => (
                  <>
                    <SwitchField
                      form={form}
                      name="virtualOnlyAcknowledged"
                      label="Draws use virtual currency only"
                      hint="Required. Tickets and prizes have no cash value; Sparko never sells or pays out real money."
                    />
                    <div className="overview-grid">
                      <UnitsField
                        form={form}
                        name="maxSpendPerDraw"
                        label="Most a member can spend per draw"
                      />
                      <NumberField
                        form={form}
                        name="maxTicketsPerMember"
                        label="Ticket limit per member"
                        min={1}
                      />
                      <NumberField
                        form={form}
                        name="maxTotalTickets"
                        label="Ticket limit per draw"
                        min={1}
                      />
                    </div>
                  </>
                )}
              </AutomationSettings>
            ),
          },
        ]}
      />
    </>
  );
}

// Reputation (R68)
export function ReputationPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Reputation"
        description="Members commend each other. Limits stop farming; self-commendations are never allowed."
      />
      <AutomationSettings
        guildId={guildId}
        featureId="R68"
        title="Commendations"
        description="Members commend from their economy page; totals show on their profile."
        enableLabel="Allow commendations"
      >
        {(form) => (
          <div className="overview-grid">
            <NumberField
              form={form}
              name="dailyLimit"
              label="Commendations per member per day"
              min={1}
              max={20}
            />
            <NumberField
              form={form}
              name="pairCooldownDays"
              label="Days before commending the same member again"
              min={1}
              max={365}
            />
            <NumberField
              form={form}
              name="minimumMemberDays"
              label="Days in the server before commending"
              min={0}
              max={365}
            />
          </div>
        )}
      </AutomationSettings>
    </>
  );
}

// Seasons (R13)
const SeasonForm = z.object({
  name: z.string().trim().min(1, 'Name the season.').max(80),
  endsAtLocal: futureLocal,
});
function SeasonRow({
  guildId,
  season,
}: {
  guildId: string;
  season: SeasonView;
}) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const [showBoard, setShowBoard] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState('');
  const board = useQuery({
    queryKey: ['economy', guildId, 'season', season.id],
    queryFn: ({ signal }) => getSeasonBoard(guildId, season.id, signal),
    enabled: showBoard,
  });
  const archive = useMutation({
    mutationFn: () =>
      archiveSeason(
        guildId,
        season.id,
        reason.trim(),
        identity('archive', season.id),
      ),
    onSuccess: refresh,
  });
  return (
    <li className="activity-row">
      <span>
        <strong className="wrap-anywhere">{season.name}</strong>
        <small>
          {new Date(season.startedAt).toLocaleDateString()} –{' '}
          {new Date(season.archivedAt ?? season.endsAt).toLocaleDateString()}
        </small>
      </span>
      <span className="row">
        <EconomyState state={season.state} />
        <Button variant="secondary" onClick={() => setShowBoard((v) => !v)}>
          {showBoard ? 'Hide board' : 'Leaderboard'}
        </Button>
        {season.state === 'active' && !archiving && (
          <Button variant="ghost" onClick={() => setArchiving(true)}>
            End early…
          </Button>
        )}
      </span>
      {showBoard &&
        (board.isPending ? (
          <LoadingState />
        ) : board.data?.length ? (
          <ol className="row-list season-board">
            {board.data.slice(0, 20).map((row, index) => (
              <li key={row.userId}>
                #{index + 1} {row.userId} · {row.xp.toLocaleString()} XP
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">
            No public entries. Members appear only if they share a public
            profile.
          </p>
        ))}
      {archiving && (
        <form
          className="row policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (Reason.safeParse(reason).success) archive.mutate();
          }}
        >
          <Field
            label="Reason (recorded); results are frozen, lifetime XP is kept"
            htmlFor={`season-${season.id}`}
          >
            <Input
              id={`season-${season.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            disabled={!Reason.safeParse(reason).success}
            busy={archive.isPending}
          >
            End season
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setArchiving(false)}
          >
            Keep running
          </Button>
        </form>
      )}
      {archive.error && <ErrorState message={errorMessage(archive.error)} />}
    </li>
  );
}
export function SeasonsPage() {
  const { guildId = '' } = useParams();
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const seasons = useQuery({
    queryKey: ['economy', guildId, 'seasons'],
    queryFn: ({ signal }) => getSeasons(guildId, signal),
  });
  const form = useForm<z.input<typeof SeasonForm>>({
    resolver: zodResolver(SeasonForm),
    defaultValues: { name: '', endsAtLocal: '' },
  });
  const start = useMutation({
    mutationFn: (v: z.output<typeof SeasonForm>) => {
      const body = {
        name: v.name,
        endsAt: new Date(v.endsAtLocal).toISOString(),
      };
      return startSeason(guildId, body, identity('season', body));
    },
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  const active = seasons.data?.some((s) => s.state === 'active');
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Seasons"
        description="Seasonal leaderboards count XP earned since the season began. Lifetime XP never resets."
      />
      <OffNotice guildId={guildId} featureId="R13" noun="Seasons" />
      <Tabs
        tabs={[
          {
            id: 'seasons',
            label: 'Seasons',
            content: (
              <div className="stack">
                {seasons.isPending ? (
                  <LoadingState />
                ) : seasons.error ? (
                  <ErrorState message={errorMessage(seasons.error)} />
                ) : seasons.data.length ? (
                  <Card>
                    <ul className="row-list">
                      {seasons.data.map((season) => (
                        <SeasonRow
                          key={season.id}
                          guildId={guildId}
                          season={season}
                        />
                      ))}
                    </ul>
                  </Card>
                ) : (
                  <EmptyState
                    icon={Trophy}
                    title="No seasons yet"
                    description="Start one to give members a fresh race."
                  />
                )}
                <Card>
                  <form
                    className="stack"
                    noValidate
                    onSubmit={form.handleSubmit((v) => start.mutate(v))}
                  >
                    <h2>Start a season</h2>
                    {active && (
                      <Notice tone="info" title="A season is running">
                        End it before starting another.
                      </Notice>
                    )}
                    <div className="overview-grid">
                      <Field
                        label="Name"
                        htmlFor="season-name"
                        error={form.formState.errors.name?.message}
                      >
                        <Input id="season-name" {...form.register('name')} />
                      </Field>
                      <Field
                        label="Ends at"
                        htmlFor="season-ends"
                        error={form.formState.errors.endsAtLocal?.message}
                      >
                        <Input
                          id="season-ends"
                          type="datetime-local"
                          {...form.register('endsAtLocal')}
                        />
                      </Field>
                    </div>
                    <div className="row">
                      <Button type="submit" busy={start.isPending}>
                        <Trophy size={16} /> Start season
                      </Button>
                    </div>
                    {start.error && (
                      <ErrorState message={errorMessage(start.error)} />
                    )}
                  </form>
                </Card>
              </div>
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R13"
                title="Seasons"
                description="Archived results keep members’ public-profile choices."
                enableLabel="Turn on seasons"
              />
            ),
          },
        ]}
      />
    </>
  );
}

// Achievements (R14)
const metrics = [
  { value: 'lifetimeXp', label: 'Lifetime XP reached' },
  { value: 'seasonXp', label: 'XP in a season' },
  { value: 'purchases', label: 'Shop purchases' },
  { value: 'hunts', label: 'Hunts completed' },
  { value: 'reputation', label: 'Commendations received' },
  { value: 'collection', label: 'Copies of an item held' },
] as const;
const AchievementForm = z
  .object({
    achievementId: Slug,
    name: z.string().trim().min(1, 'Name it.').max(80),
    description: z.string().max(1000),
    metric: z.enum(metrics.map((m) => m.value) as [string, ...string[]]),
    threshold: z.number().int().min(1).max(1_000_000_000),
    itemId: z.string().optional(),
    seasonId: z.string().optional(),
    reward: UnitsInput,
    xp: z.number().int().min(0).max(10000),
    badge: Slug,
  })
  .refine((v) => v.metric !== 'collection' || !!v.itemId, {
    path: ['itemId'],
    message: 'Choose the item to collect.',
  })
  .refine((v) => v.metric !== 'seasonXp' || !!v.seasonId, {
    path: ['seasonId'],
    message: 'Choose the season.',
  });
function NewAchievement({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const refresh = useRefreshEconomy(guildId);
  const seasons = useQuery({
    queryKey: ['economy', guildId, 'seasons'],
    queryFn: ({ signal }) => getSeasons(guildId, signal),
  });
  const form = useForm<z.input<typeof AchievementForm>>({
    resolver: zodResolver(AchievementForm),
    defaultValues: {
      achievementId: '',
      name: '',
      description: '',
      metric: 'lifetimeXp',
      threshold: 1000,
      reward: '0',
      xp: 0,
      badge: '',
    },
  });
  const metric = form.watch('metric');
  const create = useMutation({
    mutationFn: (v: z.output<typeof AchievementForm>) => {
      const { itemId, seasonId, ...rest } = v;
      const body = {
        ...rest,
        metric: v.metric as (typeof metrics)[number]['value'],
        ...(v.metric === 'collection' && itemId ? { itemId } : {}),
        ...(v.metric === 'seasonXp' && seasonId ? { seasonId } : {}),
      };
      return createAchievement(guildId, body, identity('achievement', body));
    },
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  const errors = form.formState.errors;
  return (
    <Card>
      <form
        className="stack"
        noValidate
        onSubmit={form.handleSubmit((v) => create.mutate(v))}
      >
        <h2>New achievement</h2>
        <div className="overview-grid">
          <Field label="Name" htmlFor="ach-name" error={errors.name?.message}>
            <Input id="ach-name" {...form.register('name')} />
          </Field>
          <Field
            label="Achievement ID"
            htmlFor="ach-id"
            hint="Permanent."
            error={errors.achievementId?.message}
          >
            <Input id="ach-id" {...form.register('achievementId')} />
          </Field>
          <Field label="Earned for" htmlFor="ach-metric">
            <select id="ach-metric" {...form.register('metric')}>
              {metrics.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <NumberField
            form={form as never}
            name="threshold"
            label="Target"
            min={1}
          />
          {metric === 'collection' && (
            <ItemSelect
              form={form as never}
              name="itemId"
              label="Item to collect"
              guildId={guildId}
            />
          )}
          {metric === 'seasonXp' && (
            <Field
              label="Season"
              htmlFor="ach-season"
              error={errors.seasonId?.message}
            >
              <select id="ach-season" {...form.register('seasonId')}>
                <option value="">Choose a season</option>
                {seasons.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label="Reward"
            htmlFor="ach-reward"
            hint="Virtual units; 0 for none."
            error={errors.reward?.message}
          >
            <Input
              id="ach-reward"
              inputMode="numeric"
              {...form.register('reward')}
            />
          </Field>
          <NumberField
            form={form as never}
            name="xp"
            label="Bonus XP"
            min={0}
          />
          <Field
            label="Badge ID"
            htmlFor="ach-badge"
            hint="Shown on the member’s profile."
            error={errors.badge?.message}
          >
            <Input id="ach-badge" {...form.register('badge')} />
          </Field>
        </div>
        <Field label="Description" htmlFor="ach-desc">
          <Input id="ach-desc" {...form.register('description')} />
        </Field>
        <p className="field-hint">
          Members claim it once the target is met; each member can earn it once
          (once per season for seasonal ones).
        </p>
        <div className="row">
          <Button type="submit" busy={create.isPending}>
            <Award size={16} /> Add achievement
          </Button>
        </div>
        {create.error && <ErrorState message={errorMessage(create.error)} />}
      </form>
    </Card>
  );
}
export function AchievementsPage() {
  const { guildId = '' } = useParams();
  const [, setParams] = useSearchParams();
  const shop = useShopItems(guildId);
  const list = useQuery({
    queryKey: ['economy', guildId, 'achievements'],
    queryFn: ({ signal }) => getAchievements(guildId, signal),
  });
  const itemName = (id?: string) =>
    shop.data?.find((r) => r.data.itemId === id)?.data.name ?? id;
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Achievements"
        description="Milestones members claim once, with an optional virtual reward and XP."
      />
      <OffNotice guildId={guildId} featureId="R14" noun="Achievements" />
      <Tabs
        tabs={[
          {
            id: 'achievements',
            label: 'Achievements',
            content: list.isPending ? (
              <LoadingState />
            ) : list.error ? (
              <ErrorState message={errorMessage(list.error)} />
            ) : list.data.length ? (
              <Card>
                <ul className="row-list">
                  {list.data.map((row) => (
                    <li className="activity-row" key={row.id}>
                      <span>
                        <strong className="wrap-anywhere">
                          {row.data.name}
                        </strong>
                        <small>
                          {metrics.find((m) => m.value === row.data.metric)
                            ?.label ?? row.data.metric}{' '}
                          · target {row.data.threshold.toLocaleString()}
                          {row.data.itemId && ` · ${itemName(row.data.itemId)}`}
                          {row.data.reward !== '0' &&
                            ` · ${row.data.reward} reward`}
                          {row.data.xp ? ` · ${row.data.xp} XP` : ''}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState
                icon={Award}
                title="No achievements yet"
                description="Reward members for milestones they reach."
                action={
                  <Button
                    onClick={() => setParams({ tab: 'new' }, { replace: true })}
                  >
                    Add an achievement
                  </Button>
                }
              />
            ),
          },
          {
            id: 'new',
            label: 'New',
            content: <NewAchievement guildId={guildId} />,
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <AutomationSettings
                guildId={guildId}
                featureId="R14"
                title="Achievements"
                description="Rewards are paid in the virtual economy, so it must be on for paid achievements."
                enableLabel="Turn on achievements"
              />
            ),
          },
        ]}
      />
    </>
  );
}
