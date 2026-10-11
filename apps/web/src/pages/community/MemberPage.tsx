import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Gift, Package, Ticket, Trophy } from 'lucide-react';
import {
  LevelPreferencesSchema,
  type RankCardPreferences,
} from '@sparko/messages/community-contracts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { Metric, useSession } from '../../components/AppShell';
import {
  claimCrate,
  getCrates,
  getGiveaways,
  getLeaderboard,
  getMyLevel,
  getMyRankCard,
  giveawayAction,
  saveLevelPreferences,
} from '../../services/community';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';
import { DraftGuard } from '../../hooks/useDraftGuard';

type Preferences = { publicProfile: boolean; card: RankCardPreferences };

export function RankCard({
  guildId,
  version,
}: {
  guildId: string;
  version: number;
}) {
  const card = useQuery({
    queryKey: ['rank-card', guildId, version],
    queryFn: ({ signal }) => getMyRankCard(guildId, signal),
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!card.data) return;
    const next = URL.createObjectURL(card.data.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [card.data]);
  if (card.isPending) return <LoadingState label="Rendering your card…" />;
  if (card.error)
    return (
      <ErrorState
        message={errorMessage(card.error)}
        retry={() => void card.refetch()}
      />
    );
  return url ? (
    <figure className="rank-card">
      <img src={url} alt={card.data.summary} />
      <figcaption className="field-hint">
        This is the same image Discord’s /level command sends.
      </figcaption>
    </figure>
  ) : null;
}

export function CardPreferences({
  guildId,
  saved,
  onSaved,
}: {
  guildId: string;
  saved: Preferences;
  onSaved: () => void;
}) {
  const identity = useActionIdentity();
  const form = useForm<Preferences>({
    resolver: zodResolver(LevelPreferencesSchema) as never,
    defaultValues: saved,
  });
  const dirty = form.formState.isDirty;
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) form.reset(JSON.parse(savedKey) as Preferences);
  }, [savedKey, dirty, form]);
  const save = useMutation({
    mutationFn: (body: Preferences) =>
      saveLevelPreferences(guildId, body, identity('level-prefs', body)),
    onSuccess: (_result, body) => {
      form.reset(body);
      onSaved();
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      className="stack"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <DraftGuard dirty={dirty} />
      <div className="form-grid">
        <Field
          label="Accent colour"
          htmlFor="card-accent"
          error={errors.card?.accent?.message}
        >
          <Input
            id="card-accent"
            type="color"
            {...form.register('card.accent')}
          />
        </Field>
        <Field label="Theme" htmlFor="card-theme">
          <select id="card-theme" {...form.register('card.theme')}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Field>
        <Field label="Layout" htmlFor="card-layout">
          <select id="card-layout" {...form.register('card.layout')}>
            <option value="wide">Wide</option>
            <option value="compact">Compact</option>
          </select>
        </Field>
        <Field label="Avatar shape" htmlFor="card-shape">
          <select id="card-shape" {...form.register('card.avatarShape')}>
            <option value="circle">Circle</option>
            <option value="rounded">Rounded square</option>
          </select>
        </Field>
      </div>
      <label className="switch-row">
        <span>
          <strong>Show XP and progress</strong>
          <small>When off, the card shows only your level.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          {...form.register('card.showXp')}
        />
      </label>
      <label className="switch-row">
        <span>
          <strong>Show my rank</strong>
          <small>Your position among members with recorded XP.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          {...form.register('card.showRank')}
        />
      </label>
      <label className="switch-row">
        <span>
          <strong>Appear on the public leaderboard</strong>
          <small>Only members who opt in are listed.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          {...form.register('publicProfile')}
        />
      </label>
      {save.error && <ErrorState message={errorMessage(save.error)} />}
      {save.isSuccess && !dirty && (
        <p className="save-feedback" role="status">
          Preferences saved.
        </p>
      )}
      <Button type="submit" busy={save.isPending} disabled={!dirty}>
        Save card preferences
      </Button>
    </form>
  );
}

function Leaderboard({ guildId, me }: { guildId: string; me: string }) {
  const board = useQuery({
    queryKey: ['leaderboard', guildId],
    queryFn: ({ signal }) => getLeaderboard(guildId, signal),
  });
  if (board.isPending) return <LoadingState />;
  if (board.error) return <ErrorState message={errorMessage(board.error)} />;
  if (!board.data.length)
    return (
      <EmptyState
        title="No public rankings yet"
        description="Members appear here only after opting in."
      />
    );
  return (
    <ol className="stack">
      {board.data.map((row, index) => (
        <li
          key={row.userId}
          className="activity-row"
          aria-current={row.userId === me ? 'true' : undefined}
        >
          <span>
            <strong>
              #{index + 1} {row.userId === me ? 'You' : row.userId}
            </strong>
          </span>
          <Badge tone={row.userId === me ? 'success' : 'neutral'}>
            {row.xp.toLocaleString()} XP
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function Rewards({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const crates = useQuery({
    queryKey: ['crates', guildId],
    queryFn: ({ signal }) => getCrates(guildId, signal),
  });
  const giveaways = useQuery({
    queryKey: ['giveaways', guildId],
    queryFn: ({ signal }) => getGiveaways(guildId, signal),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['crates', guildId] });
    void queryClient.invalidateQueries({ queryKey: ['giveaways', guildId] });
    void queryClient.invalidateQueries({ queryKey: ['my-level', guildId] });
  };
  const claim = useMutation({
    mutationFn: (id: string) => claimCrate(guildId, id, identity('crate', id)),
    onSuccess: refresh,
  });
  const act = useMutation({
    mutationFn: (input: { id: string; action: 'entry' | 'claim' }) =>
      giveawayAction(
        guildId,
        input.id,
        input.action,
        {},
        identity('giveaway', input),
      ),
    onSuccess: refresh,
  });
  const claimed = new Set(crates.data?.claims.map((row) => row.data.dropId));
  const entered = new Set(
    giveaways.data?.myEntries.map((row) => row.data.giveawayId),
  );
  const openDrops =
    crates.data?.drops.filter(
      (drop) => drop.state === 'open' && !drop.data.preview,
    ) ?? [];
  const openGiveaways =
    giveaways.data?.giveaways.filter((row) => row.state === 'open') ?? [];
  return (
    <div className="overview-grid">
      <Card>
        <h2>
          <Package size={18} /> XP crates
        </h2>
        {crates.isPending ? (
          <LoadingState />
        ) : crates.error ? (
          <ErrorState message={errorMessage(crates.error)} />
        ) : openDrops.length ? (
          openDrops.map((drop) => (
            <div className="activity-row" key={drop.id}>
              <span>
                <strong>{drop.data.type.name}</strong>
                <small>
                  {drop.data.claims}/{drop.data.capacity} claimed · expires{' '}
                  {new Date(drop.data.expiresAt).toLocaleTimeString()}
                </small>
              </span>
              <Button
                variant="secondary"
                disabled={claimed.has(drop.id)}
                busy={claim.isPending && claim.variables === drop.id}
                onClick={() => claim.mutate(drop.id)}
              >
                {claimed.has(drop.id) ? 'Claimed' : 'Claim'}
              </Button>
            </div>
          ))
        ) : (
          <p className="muted">No crates are open right now.</p>
        )}
        {crates.data && crates.data.claims.length > 0 && (
          <p className="field-hint">
            You have claimed {crates.data.claims.length} crate
            {crates.data.claims.length === 1 ? '' : 's'} for{' '}
            {crates.data.claims
              .reduce((sum, row) => sum + row.data.xp, 0)
              .toLocaleString()}{' '}
            XP.
          </p>
        )}
        {claim.error && <ErrorState message={errorMessage(claim.error)} />}
      </Card>
      <Card>
        <h2>
          <Gift size={18} /> Giveaways
        </h2>
        {giveaways.isPending ? (
          <LoadingState />
        ) : giveaways.error ? (
          <ErrorState message={errorMessage(giveaways.error)} />
        ) : (
          <>
            {openGiveaways.length ? (
              openGiveaways.map((row) => (
                <div className="activity-row" key={row.id}>
                  <span>
                    <strong>{row.data.prize}</strong>
                    <small>
                      Ends {new Date(row.data.endsAt).toLocaleString()}
                    </small>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={entered.has(row.id)}
                    busy={act.isPending && act.variables?.id === row.id}
                    onClick={() => act.mutate({ id: row.id, action: 'entry' })}
                  >
                    {entered.has(row.id) ? 'Entered' : 'Enter'}
                  </Button>
                </div>
              ))
            ) : (
              <p className="muted">No giveaways are open right now.</p>
            )}
            {giveaways.data.myWins.map((win) => (
              <div className="activity-row" key={win.id}>
                <span>
                  <strong>
                    <Trophy size={16} /> You won a draw
                  </strong>
                  <small>
                    {win.state === 'claimed'
                      ? 'Prize claimed'
                      : `Claim before ${new Date(win.data.claimUntil).toLocaleString()}`}
                  </small>
                </span>
                {win.state === 'unclaimed' && (
                  <Button
                    busy={
                      act.isPending && act.variables?.id === win.data.giveawayId
                    }
                    onClick={() =>
                      act.mutate({ id: win.data.giveawayId, action: 'claim' })
                    }
                  >
                    Claim prize
                  </Button>
                )}
              </div>
            ))}
          </>
        )}
        {act.error && <ErrorState message={errorMessage(act.error)} />}
      </Card>
    </div>
  );
}

export function MemberPage() {
  const { guildId = '' } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();
  const [cardVersion, setCardVersion] = useState(0);
  const level = useQuery({
    queryKey: ['my-level', guildId],
    queryFn: ({ signal }) => getMyLevel(guildId, signal),
  });
  if (level.isPending)
    return <LoadingState label="Opening your member profile…" />;
  if (level.error)
    return (
      <ErrorState
        message={errorMessage(level.error)}
        retry={() => void level.refetch()}
      />
    );
  const { profile, history } = level.data;
  const max = profile.nextLevelXp === null;
  const span = max ? 1 : profile.nextLevelXp! - profile.previousLevelXp;
  const into = max ? 1 : profile.xp - profile.previousLevelXp;
  return (
    <>
      <PageHeading
        eyebrow="Member portal"
        title="Your place in the community."
        description="Your own progression, rewards and conversations in this server."
        actions={
          <Link
            className="button button-secondary"
            to={`/servers/${guildId}/tickets`}
          >
            <Ticket size={16} />
            Your tickets
          </Link>
        }
      />
      <div className="metric-grid">
        <Metric
          label="Level"
          value={profile.level}
          detail={max ? 'Maximum level' : 'Derived from recorded XP'}
        />
        <Metric
          label="Lifetime XP"
          value={profile.xp.toLocaleString()}
          detail="Eligible Discord activity"
        />
        <Metric
          label="Server rank"
          value={profile.rank ?? '—'}
          detail="Among members with XP"
        />
      </div>
      <Card>
        <div
          className="progress"
          role="progressbar"
          aria-label="Progress to the next level"
          aria-valuemin={0}
          aria-valuemax={span}
          aria-valuenow={into}
          aria-valuetext={profile.textSummary}
        >
          <span style={{ width: `${Math.round(profile.progress * 100)}%` }} />
        </div>
        <p className="field-hint">{profile.textSummary}</p>
      </Card>
      <div className="overview-grid">
        <Card>
          <h2>Your rank card</h2>
          <RankCard guildId={guildId} version={cardVersion} />
        </Card>
        <Card>
          <h2>Card & privacy</h2>
          <CardPreferences
            guildId={guildId}
            saved={{ publicProfile: profile.publicProfile, card: profile.card }}
            onSaved={() => {
              setCardVersion((value) => value + 1);
              void queryClient.invalidateQueries({
                queryKey: ['my-level', guildId],
              });
              void queryClient.invalidateQueries({
                queryKey: ['leaderboard', guildId],
              });
            }}
          />
        </Card>
      </div>
      <Rewards guildId={guildId} />
      <div className="overview-grid">
        <Card id="leaderboard">
          <h2>Leaderboard</h2>
          <Leaderboard guildId={guildId} me={session.data?.user?.id ?? ''} />
        </Card>
        <Card>
          <h2>XP history</h2>
          {history.length ? (
            history.slice(0, 20).map((entry) => (
              <div className="activity-row" key={entry.id}>
                <span>
                  <strong>
                    {entry.data.delta > 0 ? '+' : ''}
                    {entry.data.delta.toLocaleString()} XP
                  </strong>
                  <small>{entry.data.reason}</small>
                </span>
                <small className="muted">
                  {new Date(entry.data.observedAt).toLocaleString()}
                </small>
              </div>
            ))
          ) : (
            <EmptyState
              title="Your story is just starting"
              description="XP appears after you send eligible messages."
            />
          )}
        </Card>
      </div>
    </>
  );
}

/** Staff view: cards are personal, so this shows how members customize theirs. */
export function RankCardsPage() {
  const { guildId = '' } = useParams();
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(0);
  const level = useQuery({
    queryKey: ['my-level', guildId],
    queryFn: ({ signal }) => getMyLevel(guildId, signal),
  });
  return (
    <>
      <PageHeading
        eyebrow="Engagement"
        title="Rank cards members are proud of."
        description="Each member styles their own card. Sparko draws identity, level, XP and rank from server records, never from the member’s input."
        actions={
          <Link
            className="button button-secondary"
            to={`/servers/${guildId}/me`}
          >
            Open member portal
          </Link>
        }
      />
      <Card>
        <p>
          Members change accent colour, theme, layout and avatar shape, and can
          hide XP or rank. The website preview and Discord’s <code>/level</code>{' '}
          command use the same renderer and font, so they always match.
        </p>
      </Card>
      {level.isPending ? (
        <LoadingState />
      ) : level.error ? (
        <ErrorState message={errorMessage(level.error)} />
      ) : (
        <div className="overview-grid">
          <Card>
            <h2>Your card in this server</h2>
            <RankCard guildId={guildId} version={version} />
          </Card>
          <Card>
            <h2>Try the options</h2>
            <CardPreferences
              guildId={guildId}
              saved={{
                publicProfile: level.data.profile.publicProfile,
                card: level.data.profile.card,
              }}
              onSaved={() => {
                setVersion((value) => value + 1);
                void queryClient.invalidateQueries({
                  queryKey: ['my-level', guildId],
                });
              }}
            />
          </Card>
        </div>
      )}
    </>
  );
}
