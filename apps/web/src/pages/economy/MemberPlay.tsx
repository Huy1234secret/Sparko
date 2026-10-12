import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Award, Brain, Compass, Hammer, HandHeart, Ticket } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
} from '@sparko/ui';
import {
  EconomyState,
  RarityBadge,
  Units,
  UserId,
  atLeast,
  readyAt,
  untilText,
  useNow,
  useRefreshEconomy,
  useRetryKey,
} from '../../features/economy/shared';
import {
  answerTrivia,
  claimAchievement,
  commend,
  craft,
  enterLottery,
  getAchievements,
  getCollections,
  getGames,
  getLotteries,
  getMyAwards,
  getReputation,
  getSeasonBoard,
  getSeasons,
  hunt,
  startTrivia,
  type Games,
  type LotteryView,
} from '../../services/economy';
import { errorMessage } from '../../services/http';
import { useSession } from '../../components/AppShell';
import type { TabProps } from './MemberEconomy';

const percent = (value: number) =>
  `${value < 0.01 ? '<1' : Math.round(value * 100)}%`;

export function CollectionTab({ guildId, overview }: TabProps) {
  const now = useNow();
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const [found, setFound] = useState<string | null>(null);
  const collections = useQuery({
    queryKey: ['economy', guildId, 'collections'],
    queryFn: ({ signal }) => getCollections(guildId, signal),
  });
  const go = useMutation({
    mutationFn: () => hunt(guildId, retry.key('hunt')),
    onSuccess: (result) => {
      retry.done('hunt');
      const name =
        collections.data?.hunt.drops.find(
          (d) => d.itemId === result.data.data.itemId,
        )?.name ?? result.data.data.itemId;
      setFound(`${name} × ${result.data.data.quantity}`);
      refresh();
    },
  });
  const make = useMutation({
    mutationFn: (recipeId: string) =>
      craft(guildId, recipeId, retry.key(`craft:${recipeId}`)),
    onSuccess: (_r, recipeId) => {
      retry.done(`craft:${recipeId}`);
      refresh();
    },
  });
  if (collections.isPending) return <LoadingState />;
  if (collections.error)
    return (
      <ErrorState
        message={errorMessage(collections.error)}
        retry={() => void collections.refetch()}
      />
    );
  const { catalog, recipes, hunt: rules } = collections.data;
  const huntReady =
    rules.configured &&
    rules.huntsToday < rules.huntsPerDay &&
    readyAt(rules.nextHuntAt, now);
  const owned = catalog.filter((c) => c.quantity > 0).length;
  return (
    <div className="stack">
      <Card>
        <div className="section-heading">
          <div>
            <h2>Hunt</h2>
            <p className="muted">
              {rules.huntsToday} of {rules.huntsPerDay} hunts used today
              {rules.nextHuntAt && !readyAt(rules.nextHuntAt, now)
                ? ` · next ${untilText(rules.nextHuntAt, now)}`
                : ''}
              .
            </p>
          </div>
          <Button
            disabled={!huntReady}
            busy={go.isPending}
            onClick={() => go.mutate()}
          >
            <Compass size={16} /> Go hunting
          </Button>
        </div>
        {found && (
          <p className="success-text" role="status">
            You found {found}.
          </p>
        )}
        {go.error && <ErrorState message={errorMessage(go.error)} />}
        {rules.configured ? (
          <table className="compact-table">
            <caption className="sr-only">Possible finds</caption>
            <thead>
              <tr>
                <th scope="col">Find</th>
                <th scope="col">Rarity</th>
                <th scope="col">Chance</th>
              </tr>
            </thead>
            <tbody>
              {rules.drops.map((drop) => (
                <tr key={drop.itemId}>
                  <th scope="row">
                    {drop.name}
                    {drop.quantity > 1 ? ` × ${drop.quantity}` : ''}
                  </th>
                  <td>
                    <RarityBadge rarity={drop.rarity} />
                  </td>
                  <td>{percent(drop.chance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Staff haven’t set up any finds yet.</p>
        )}
      </Card>
      <Card>
        <h2>
          Collection{' '}
          <small className="muted">
            {owned} of {catalog.length}
          </small>
        </h2>
        {catalog.length ? (
          <ul className="collection-grid">
            {catalog.map(({ item, quantity }) => (
              <li
                key={item.itemId}
                className={quantity ? 'collected' : 'missing'}
              >
                <strong className="wrap-anywhere">{item.name}</strong>
                <RarityBadge rarity={item.rarity} />
                <small>{quantity ? `× ${quantity}` : 'Not found yet'}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No collectibles in this server yet.</p>
        )}
      </Card>
      {recipes.length > 0 && (
        <Card>
          <h2>Crafting</h2>
          <ul className="row-list">
            {recipes.map((recipe) => {
              const ready =
                recipe.ingredients.every((i) => i.have >= i.quantity) &&
                atLeast(overview.balance.balance, recipe.cost);
              return (
                <li className="activity-row" key={recipe.id}>
                  <span>
                    <strong className="wrap-anywhere">
                      {recipe.name} → {recipe.result.name} ×{' '}
                      {recipe.result.quantity}
                    </strong>
                    <small>
                      Needs{' '}
                      {recipe.ingredients
                        .map(
                          (i) =>
                            `${i.name} ${Math.min(i.have, i.quantity)}/${i.quantity}`,
                        )
                        .join(', ')}
                      {recipe.cost !== '0' &&
                        ` · costs ${recipe.cost} ${overview.currencyName}`}
                    </small>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={!ready}
                    busy={make.isPending && make.variables === recipe.recipeId}
                    onClick={() => make.mutate(recipe.recipeId)}
                  >
                    <Hammer size={16} /> Craft
                  </Button>
                </li>
              );
            })}
          </ul>
          {make.error && <ErrorState message={errorMessage(make.error)} />}
        </Card>
      )}
    </div>
  );
}

function OpenQuestion({
  guildId,
  current,
  onDone,
}: {
  guildId: string;
  current: NonNullable<Games['current']>;
  onDone: () => void;
}) {
  const now = useNow(1000);
  const retry = useRetryKey();
  const [choice, setChoice] = useState<number | null>(null);
  const answer = useMutation({
    mutationFn: (picked: number) =>
      answerTrivia(guildId, current.id, picked, retry.key(current.id)),
    onSuccess: onDone,
  });
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(current.expiresAt) - now) / 1000),
  );
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice !== null) answer.mutate(choice);
      }}
    >
      <fieldset className="stack" disabled={seconds === 0}>
        <legend className="wrap-anywhere">{current.question}</legend>
        <p className="field-hint" aria-live="polite">
          {seconds
            ? `${seconds} s left · correct answers earn ${current.reward}`
            : 'Time is up.'}
        </p>
        {current.choices.map((label, index) => (
          <label className="checkbox-row" key={index}>
            <input
              type="radio"
              name={`trivia-${current.id}`}
              checked={choice === index}
              onChange={() => setChoice(index)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="row">
        {seconds ? (
          <Button
            type="submit"
            disabled={choice === null}
            busy={answer.isPending}
          >
            Submit answer
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={onDone}>
            See result
          </Button>
        )}
      </div>
      {answer.error && <ErrorState message={errorMessage(answer.error)} />}
    </form>
  );
}
export function GamesTab({ guildId, overview }: TabProps) {
  const now = useNow();
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const games = useQuery({
    queryKey: ['economy', guildId, 'games'],
    queryFn: ({ signal }) => getGames(guildId, signal),
  });
  const start = useMutation({
    mutationFn: () => startTrivia(guildId, retry.key('play')),
    onSuccess: () => {
      retry.done('play');
      refresh();
    },
  });
  if (games.isPending) return <LoadingState />;
  if (games.error)
    return (
      <ErrorState
        message={errorMessage(games.error)}
        retry={() => void games.refetch()}
      />
    );
  const data = games.data;
  const canPlay = data.playsLeft > 0 && readyAt(data.nextPlayAt, now);
  return (
    <div className="stack">
      <Card>
        <h2>Trivia</h2>
        {data.current ? (
          <OpenQuestion
            key={data.current.id}
            guildId={guildId}
            current={data.current}
            onDone={refresh}
          />
        ) : (
          <div className="section-heading">
            <p className="muted">
              Answer within {data.answerSeconds} seconds to earn {data.reward}{' '}
              {overview.currencyName}. {data.playsLeft} of {data.playsPerDay}{' '}
              plays left today
              {data.nextPlayAt && !readyAt(data.nextPlayAt, now)
                ? ` · next ${untilText(data.nextPlayAt, now)}`
                : ''}
              .
            </p>
            <Button
              disabled={!canPlay}
              busy={start.isPending}
              onClick={() => start.mutate()}
            >
              <Brain size={16} /> Play
            </Button>
          </div>
        )}
        {start.error && <ErrorState message={errorMessage(start.error)} />}
      </Card>
      <Card>
        <h2>Recent answers</h2>
        {data.recent.length ? (
          <ul className="row-list">
            {data.recent.map((game) => (
              <li className="activity-row" key={game.id}>
                <span>
                  <strong className="wrap-anywhere">{game.question}</strong>
                  <small>
                    Answer: {game.choices[game.correctIndex]}
                    {game.selectedIndex !== null &&
                      game.selectedIndex !== game.correctIndex &&
                      ` · you said ${game.choices[game.selectedIndex]}`}
                    {game.reward !== '0' &&
                      ` · +${game.reward} ${overview.currencyName}`}
                  </small>
                </span>
                <EconomyState state={game.state} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Your answers will appear here.</p>
        )}
      </Card>
    </div>
  );
}

function LotteryCard({
  guildId,
  overview,
  lottery,
}: TabProps & { lottery: LotteryView }) {
  const now = useNow();
  const you = useSession().data?.user?.id;
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const [tickets, setTickets] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const enter = useMutation({
    mutationFn: () =>
      enterLottery(guildId, lottery.id, tickets, retry.key(`${tickets}`)),
    onSuccess: () => {
      retry.done(`${tickets}`);
      setAgreed(false);
      refresh();
    },
  });
  const open = lottery.state === 'open' && Date.parse(lottery.endsAt) > now;
  const room = Math.min(
    lottery.maxTicketsPerMember - lottery.myTickets,
    lottery.maxTotalTickets - lottery.totalTickets,
  );
  const cost = (BigInt(lottery.ticketPrice) * BigInt(tickets)).toString();
  const id = `tickets-${lottery.id}`;
  return (
    <Card>
      <div className="section-heading">
        <h3 className="wrap-anywhere">{lottery.name}</h3>
        <EconomyState state={lottery.state} />
      </div>
      <p className="muted">
        Pot <Units value={lottery.pot} name={overview.currencyName} /> ·{' '}
        {lottery.totalTickets} tickets sold · you hold {lottery.myTickets} of{' '}
        {lottery.maxTicketsPerMember}
        {open && ` · draws ${untilText(lottery.endsAt, now)}`}
      </p>
      {lottery.state === 'drawn' && (
        <p>
          {lottery.winnerId === null
            ? 'No tickets were sold.'
            : lottery.winnerId === you
              ? 'You won the pot!'
              : `Won by ${lottery.winnerId}.`}
        </p>
      )}
      {lottery.state === 'cancelled' && (
        <p className="muted">Cancelled. Every ticket was refunded.</p>
      )}
      {open && room > 0 && (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            enter.mutate();
          }}
        >
          <label className="inline-field" htmlFor={id}>
            <span>Tickets</span>
            <Input
              id={id}
              type="number"
              min={1}
              max={room}
              value={tickets}
              onChange={(e) =>
                setTickets(
                  Math.min(room, Math.max(1, Number(e.target.value) || 1)),
                )
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I understand this is a virtual draw: tickets cost{' '}
              {overview.currencyName}, prizes are {overview.currencyName}, and
              nothing has cash value.
            </span>
          </label>
          <div className="row">
            <Button
              type="submit"
              disabled={!agreed || !atLeast(overview.balance.balance, cost)}
              busy={enter.isPending}
            >
              <Ticket size={16} /> Buy for {cost} {overview.currencyName}
            </Button>
          </div>
        </form>
      )}
      {open && room <= 0 && (
        <p className="muted">You have the most tickets allowed.</p>
      )}
      {enter.error && <ErrorState message={errorMessage(enter.error)} />}
    </Card>
  );
}
export function LotteryTab(props: TabProps) {
  const lotteries = useQuery({
    queryKey: ['economy', props.guildId, 'lotteries'],
    queryFn: ({ signal }) => getLotteries(props.guildId, signal),
  });
  if (lotteries.isPending) return <LoadingState />;
  if (lotteries.error)
    return (
      <ErrorState
        message={errorMessage(lotteries.error)}
        retry={() => void lotteries.refetch()}
      />
    );
  if (!lotteries.data.length)
    return (
      <EmptyState
        icon={Ticket}
        title="No draws yet"
        description="Staff announce virtual draws here."
      />
    );
  return (
    <div className="stack">
      {lotteries.data.map((lottery) => (
        <LotteryCard key={lottery.id} {...props} lottery={lottery} />
      ))}
    </div>
  );
}

const CommendForm = z.object({
  recipientId: UserId,
  reason: z.string().trim().min(3, 'Say what they did.').max(300),
});
function Reputation({ guildId }: { guildId: string }) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const reputation = useQuery({
    queryKey: ['economy', guildId, 'reputation'],
    queryFn: ({ signal }) => getReputation(guildId, signal),
  });
  const form = useForm<z.input<typeof CommendForm>>({
    resolver: zodResolver(CommendForm),
    defaultValues: { recipientId: '', reason: '' },
  });
  const send = useMutation({
    mutationFn: (values: z.output<typeof CommendForm>) =>
      commend(guildId, values, retry.key(values.recipientId)),
    onSuccess: (_r, values) => {
      retry.done(values.recipientId);
      form.reset();
      refresh();
    },
  });
  return (
    <Card>
      <h2>Reputation</h2>
      <p>
        <strong>{reputation.data?.profile?.data.total ?? 0}</strong>{' '}
        <span className="muted">commendations received</span>
      </p>
      {reputation.data?.events.slice(0, 5).map((event) => (
        <div className="activity-row" key={event.id}>
          <span>
            <strong className="wrap-anywhere">{event.data.reason}</strong>
            <small>
              From {event.data.senderId} ·{' '}
              {new Date(event.data.at).toLocaleDateString()}
            </small>
          </span>
        </div>
      ))}
      <form
        className="stack section-gap"
        noValidate
        onSubmit={form.handleSubmit((values) => send.mutate(values))}
      >
        <h3>Commend a member</h3>
        <Field
          label="Member (Discord user ID)"
          htmlFor="commend-recipient"
          error={form.formState.errors.recipientId?.message}
        >
          <Input
            id="commend-recipient"
            inputMode="numeric"
            autoComplete="off"
            {...form.register('recipientId')}
          />
        </Field>
        <Field
          label="What they did"
          htmlFor="commend-reason"
          error={form.formState.errors.reason?.message}
        >
          <Input id="commend-reason" {...form.register('reason')} />
        </Field>
        <div className="row">
          <Button type="submit" busy={send.isPending}>
            <HandHeart size={16} /> Commend
          </Button>
        </div>
        {send.isSuccess && (
          <p className="success-text" role="status">
            Thanks for recognising them.
          </p>
        )}
        {send.error && <ErrorState message={errorMessage(send.error)} />}
      </form>
    </Card>
  );
}

function Achievements({ guildId, overview }: TabProps) {
  const retry = useRetryKey();
  const refresh = useRefreshEconomy(guildId);
  const list = useQuery({
    queryKey: ['economy', guildId, 'achievements'],
    queryFn: ({ signal }) => getAchievements(guildId, signal),
  });
  const awards = useQuery({
    queryKey: ['economy', guildId, 'awards'],
    queryFn: ({ signal }) => getMyAwards(guildId, signal),
  });
  const claim = useMutation({
    mutationFn: (id: string) =>
      claimAchievement(guildId, id, retry.key(`claim:${id}`)),
    onSuccess: refresh,
  });
  const earned = new Set(awards.data?.map((a) => a.data.achievementId));
  return (
    <Card>
      <h2>Achievements</h2>
      {list.isPending ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState message={errorMessage(list.error)} />
      ) : list.data.length ? (
        <ul className="row-list">
          {list.data.map((row) => {
            const a = row.data;
            const done = earned.has(a.achievementId);
            const ratio = Math.min(1, row.progress / a.threshold);
            return (
              <li className="activity-row" key={row.id}>
                <span>
                  <strong className="wrap-anywhere">{a.name}</strong>
                  <small>
                    {a.description || `${a.threshold} ${a.metric}`}
                    {a.reward !== '0' &&
                      ` · ${a.reward} ${overview.currencyName}`}
                    {a.xp ? ` · ${a.xp} XP` : ''}
                  </small>
                  <span
                    className="progress"
                    role="progressbar"
                    aria-label={`${a.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={a.threshold}
                    aria-valuenow={Math.min(row.progress, a.threshold)}
                  >
                    <span style={{ width: `${ratio * 100}%` }} />
                  </span>
                </span>
                {done ? (
                  <EconomyState state="settled" />
                ) : (
                  <Button
                    variant="secondary"
                    disabled={ratio < 1}
                    busy={
                      claim.isPending && claim.variables === a.achievementId
                    }
                    onClick={() => claim.mutate(a.achievementId)}
                  >
                    <Award size={16} /> Claim
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">No achievements yet.</p>
      )}
      {claim.error && <ErrorState message={errorMessage(claim.error)} />}
    </Card>
  );
}

function Season({ guildId }: { guildId: string }) {
  const seasons = useQuery({
    queryKey: ['economy', guildId, 'seasons'],
    queryFn: ({ signal }) => getSeasons(guildId, signal),
  });
  const active = seasons.data?.find((s) => s.state === 'active');
  const board = useQuery({
    queryKey: ['economy', guildId, 'season', active?.id],
    queryFn: ({ signal }) => getSeasonBoard(guildId, active!.id, signal),
    enabled: !!active,
  });
  if (seasons.isPending) return <LoadingState />;
  return (
    <Card>
      <h2>{active ? active.name : 'Season'}</h2>
      {active ? (
        <>
          <p className="muted">
            Ends {new Date(active.endsAt).toLocaleDateString()}. Only members
            who share a public profile appear here.
          </p>
          {board.data?.length ? (
            <ol className="row-list">
              {board.data.slice(0, 10).map((row, index) => (
                <li className="activity-row" key={row.userId}>
                  <span>
                    <strong>
                      #{index + 1} {row.userId}
                    </strong>
                  </span>
                  <span>{row.xp.toLocaleString()} XP</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Nobody on the board yet.</p>
          )}
        </>
      ) : (
        <p className="muted">No season is running.</p>
      )}
    </Card>
  );
}

export function StandingTab(props: TabProps) {
  const { modules } = props.overview;
  return (
    <div className="stack">
      {!modules['R68'] && !modules['R14'] && !modules['R13'] && (
        <Notice tone="info" title="Nothing to show">
          Reputation, achievements and seasons are off.
        </Notice>
      )}
      {modules['R13'] && <Season guildId={props.guildId} />}
      {modules['R14'] && <Achievements {...props} />}
      {modules['R68'] && <Reputation guildId={props.guildId} />}
    </div>
  );
}
