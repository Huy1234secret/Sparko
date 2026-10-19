import type { ReactNode } from 'react';
import { Checkbox, Combobox, Icon, Input, Segmented } from '../../ui';
import {
  qaId,
  qaLengths,
  qaRanges,
  type Channel,
  type QaAfter,
  type QaArchive,
  type QaCategory,
  type Questions,
  type RoleOption,
} from '../../data';
import { AnimatedIconButton, InfoTip } from './EditorBits';
import { EmojiField } from './EmojiPicker';
import { DurationInput, Used } from './ARTriggers';
import { ChannelPicker, roleItems } from './parts';
import { plusAnimations } from './StudioLibrary';

const NONE = 'none';
const timeFormat = 'Use mi, h, d, w, mt and y, like 30mi, 12h, 1d or 1w.';

/** A label with an (i) beside it that says more on hover. */
const tipped = (text: string, tip: string): ReactNode => (
  <>
    {text} <InfoTip text={tip} />
  </>
);

/**
 * Roles for "who can" and ping pickers. Sparko doesn't give these, so roles
 * above its own can be picked too.
 */
const anyRoles = (roles: RoleOption[]) =>
  roleItems(roles.map((r) => ({ ...r, assignable: true })));

const whole = (text: string, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number(text) || 0)));

const archiveNames: Record<QaArchive, string> = {
  60: '1 hour',
  1440: '1 day',
  4320: '3 days',
  10080: '1 week',
};

function CategoryRow({
  category,
  serverId,
  onChange,
  onRemove,
}: {
  category: QaCategory;
  serverId: string;
  onChange: (patch: Partial<QaCategory>) => void;
  onRemove: () => void;
}) {
  const name = category.name.trim() || 'this category';
  return (
    <li className="sp-qa-category" data-issue={`category:${category.id}`}>
      <EmojiField
        serverId={serverId}
        value={category.emoji}
        label={`Emoji for ${name}`}
        onChange={(emoji) => onChange({ emoji })}
      />
      <Input
        aria-label="Category name"
        placeholder="Category name, like Roles"
        maxLength={30}
        value={category.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <button
        type="button"
        className="sp-icon-btn sp-icon-btn--danger"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        <Icon name="trash-2" size="sm" />
      </button>
    </li>
  );
}

/** The Settings tab: where, who, asking, categories, threads and closing. */
export function QASettings({
  config,
  serverId,
  channels,
  roles,
  limits,
  onChange,
}: {
  config: Questions;
  serverId: string;
  channels: Channel[];
  roles: RoleOption[];
  limits: { categories: number; maxOpen: number };
  onChange: (patch: Partial<Questions>) => void;
}) {
  const channel = channels.find((c) => c.id === config.channel);
  const fullCategories = config.categories.length >= limits.categories;
  const editCategory = (id: string, patch: Partial<QaCategory>) =>
    onChange({
      categories: config.categories.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });

  return (
    <div className="sp-stack sp-ar sp-sg sp-qa">
      <section className="sp-card" aria-labelledby="qa-where">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="qa-where">
              Channel and people
            </h2>
            <p className="sp-card__sub">
              Where questions go, who can ask them and who answers.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair">
            <div data-issue="channel">
              <ChannelPicker
                label="Questions channel"
                channels={channels}
                value={config.channel}
                onChange={(id) => onChange({ channel: id })}
                error={
                  channel && !channel.canPost
                    ? 'Sparko can’t post here yet.'
                    : undefined
                }
                hint="Each question is posted here with its own thread. Sparko needs to post, open threads and manage threads here."
              />
            </div>
            <div data-issue="ping">
              <Combobox
                label={tipped(
                  'Ping a role for new questions',
                  'Sparko mentions this role in each new question, so the people who answer hear about it. The role has to be mentionable, or Sparko needs Mention @everyone.',
                )}
                searchPlaceholder="Search roles"
                value={config.ping || NONE}
                onChange={(v) => onChange({ ping: v === NONE ? '' : v })}
                items={[
                  {
                    value: NONE,
                    label: 'Nobody',
                    icon: 'ban',
                    group: 'Default',
                  },
                  ...anyRoles(roles),
                ]}
              />
            </div>
          </div>
          <div className="sp-ar__pair">
            <div data-issue="askers">
              <Combobox
                label={tipped(
                  'Who can ask',
                  'Members with any of these roles can ask questions. Leave it empty for everyone.',
                )}
                multiple
                placeholder="Everyone"
                searchPlaceholder="Search roles"
                value={config.askers}
                onChange={(askers) => onChange({ askers })}
                items={anyRoles(roles).map((r) =>
                  r.value === config.blacklist
                    ? { ...r, disabled: true, note: 'Blacklisted' }
                    : r,
                )}
              />
            </div>
            <div data-issue="blacklist">
              <Combobox
                label={tipped(
                  'Blacklist role',
                  'Members with this role can’t ask questions, whatever other roles they have.',
                )}
                searchPlaceholder="Search roles"
                value={config.blacklist || NONE}
                onChange={(v) => onChange({ blacklist: v === NONE ? '' : v })}
                items={[
                  { value: NONE, label: 'None', icon: 'ban', group: 'Default' },
                  ...anyRoles(roles).map((r) =>
                    config.askers.includes(r.value)
                      ? { ...r, disabled: true, note: 'Can ask' }
                      : r,
                  ),
                ]}
              />
            </div>
          </div>
          <div data-issue="answerers">
            <Combobox
              label={tipped(
                'Who can answer',
                'Staff who can answer, close, reopen and delete questions. Leave it empty for members with Manage Server.',
              )}
              multiple
              placeholder="Manage Server only"
              searchPlaceholder="Search roles"
              value={config.answerers}
              onChange={(answerers) => onChange({ answerers })}
              items={anyRoles(roles)}
            />
          </div>
        </div>
      </section>

      <section className="sp-card" aria-labelledby="qa-asking">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="qa-asking">
              Asking
            </h2>
            <p className="sp-card__sub">
              What members fill in, and how often they can ask.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-ar__pair" data-issue="length">
            <Input
              label="Shortest details"
              type="number"
              min={0}
              max={config.maxLength}
              value={String(config.minLength)}
              hint="Characters, once members write something. 0 lets any length through."
              onChange={(e) =>
                onChange({
                  minLength: whole(e.target.value, 0, config.maxLength),
                })
              }
            />
            <Input
              label="Longest details"
              type="number"
              min={qaLengths.maxFloor}
              max={qaLengths.max}
              value={String(config.maxLength)}
              hint="Characters, 100 to 2,000."
              onChange={(e) =>
                onChange({
                  maxLength: whole(e.target.value, 0, qaLengths.max),
                })
              }
            />
          </div>
          <div className="sp-ar__pair">
            <div data-issue="cooldown">
              <DurationInput
                label="Cooldown between questions"
                tip="How long a member waits after asking before they can ask again. From 1 minute up to 1 month. Leave it empty for no cooldown."
                value={config.cooldown}
                placeholder="No cooldown"
                range={qaRanges.cooldown}
                format={timeFormat}
                onChange={(cooldown) => onChange({ cooldown })}
              />
            </div>
            <div data-issue="maxOpen">
              <Input
                label={tipped(
                  'Open questions per member',
                  `How many questions one member can have waiting for an answer at once. This plan allows 1 to ${limits.maxOpen}.`,
                )}
                aria-label="Open questions per member"
                type="number"
                min={1}
                max={limits.maxOpen}
                value={String(config.maxOpen)}
                end={
                  <Used
                    n={config.maxOpen}
                    max={limits.maxOpen}
                    what="open questions per member"
                  />
                }
                onChange={(e) =>
                  onChange({
                    maxOpen: whole(e.target.value, 1, limits.maxOpen),
                  })
                }
              />
            </div>
          </div>
          <div className="sp-ar__checks">
            <Checkbox
              checked={config.requireDetails}
              onChange={(requireDetails) => onChange({ requireDetails })}
              label="Require details"
              description="Members have to write more than the title. Off makes the details box optional."
            />
            <Checkbox
              checked={config.anonymous}
              onChange={(anonymous) => onChange({ anonymous })}
              label="Anonymous questions"
              description="The post doesn’t say who asked, and they aren’t added to the thread. Staff still see the asker in Storage."
            />
            <Checkbox
              checked={config.meToo}
              onChange={(meToo) => onChange({ meToo })}
              label="“Me too” button"
              description="Members with the same question press it, so staff see what’s asked most."
            />
          </div>
        </div>
      </section>

      <section
        className="sp-card"
        aria-labelledby="qa-categories"
        data-issue="categories"
      >
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="qa-categories">
              Categories
            </h2>
            <p className="sp-card__sub">
              Topics members pick when they ask. Leave it empty for none.
            </p>
          </div>
          <div className="sp-ar__head-actions">
            <Used
              n={config.categories.length}
              max={limits.categories}
              what="categories"
              icon="status"
            />
            <AnimatedIconButton
              size="sm"
              {...plusAnimations}
              disabled={fullCategories}
              title={
                fullCategories
                  ? `This plan has up to ${limits.categories} categories.`
                  : undefined
              }
              onClick={() =>
                onChange({
                  categories: [
                    ...config.categories,
                    { id: qaId(), name: '', emoji: '' },
                  ],
                })
              }
            >
              Category
            </AnimatedIconButton>
          </div>
        </div>
        <div className="sp-card__body">
          {config.categories.length ? (
            <ul className="sp-qa-categories">
              {config.categories.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  serverId={serverId}
                  onChange={(patch) => editCategory(c.id, patch)}
                  onRemove={() =>
                    onChange({
                      categories: config.categories.filter(
                        (x) => x.id !== c.id,
                      ),
                    })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="sp-hint">
              No categories yet. Members can still ask; questions show as
              General.
            </p>
          )}
        </div>
      </section>

      <section className="sp-card" aria-labelledby="qa-threads">
        <div className="sp-card__head">
          <div className="sp-card__titles">
            <h2 className="sp-card__title" id="qa-threads">
              Threads and closing
            </h2>
            <p className="sp-card__sub">
              What happens to a question’s thread, before and after it’s
              answered.
            </p>
          </div>
        </div>
        <div className="sp-card__body">
          <div className="sp-field">
            <span className="sp-label">
              Hide quiet threads after{' '}
              <InfoTip text="Discord hides a thread from the channel list once nobody has written in it for this long. It comes back when someone writes." />
            </span>
            <Segmented<`${QaArchive}`>
              label="Hide quiet threads after"
              value={`${config.archive}`}
              onChange={(v) => onChange({ archive: Number(v) as QaArchive })}
              options={([60, 1440, 4320, 10080] as const).map((m) => ({
                value: `${m}`,
                label: archiveNames[m],
              }))}
            />
          </div>
          <div className="sp-field" data-issue="after">
            <span className="sp-label">
              Once a question is answered, its thread{' '}
              <InfoTip text="Closing locks and archives the thread, so the answer stays but nobody writes in it. Mark answered counts too. Staff can reopen a question to answer it again." />
            </span>
            <Segmented<QaAfter>
              label="Once a question is answered, its thread"
              value={config.after}
              onChange={(after) => onChange({ after })}
              options={[
                { value: 'now', label: 'Close now' },
                { value: 'later', label: 'Close later' },
                { value: 'never', label: 'Keep open' },
              ]}
            />
          </div>
          {config.after === 'later' && (
            <div data-issue="closeAfter" className="sp-sg-age">
              <DurationInput
                label="Close the thread after"
                tip="How long after the answer the thread closes, so the asker can still say thanks. From 1 minute up to 1 month. Sparko checks every minute."
                value={config.closeAfter}
                placeholder="1d"
                range={qaRanges.closeAfter}
                format={timeFormat}
                onChange={(closeAfter) => onChange({ closeAfter })}
              />
            </div>
          )}
          <div data-issue="expire" className="sp-sg-age">
            <DurationInput
              label="Expire unanswered questions after"
              tip="A question nobody answered in this long is marked Expired and its thread closes. From 1 hour up to 1 year. Leave it empty to keep them open."
              value={config.expire}
              placeholder="Never"
              range={qaRanges.expire}
              format={timeFormat}
              onChange={(expire) => onChange({ expire })}
            />
          </div>
          <Checkbox
            checked={config.dm}
            onChange={(dm) => onChange({ dm })}
            label="DM the asker when it’s answered"
            description="Sends them the answer with a link to the thread. Pick the message in Edit. People who don’t take DMs from the server won’t get it; the log says so."
          />
        </div>
      </section>
    </div>
  );
}
