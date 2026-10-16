import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  DiscordMessage,
  Icon,
  Segmented,
  Spinner,
  Switch,
} from '../ui';
import { groupMeta, groups, modules } from '../content/modules';
import { homeFaq, scenes } from '../content/site';
import { Faq, PricingTeaser } from './parts';
import { useAccountActions, usePageTitle } from './SiteLayout';
import {
  reducedMotion,
  Tilt,
  useOnScreenClass,
  useOrbitControl,
  usePointerGlow,
  useTilt,
} from './motion';
import { commands } from '../content/commands';

/** Staggers a child's entrance: `--i` is its place in the sequence. */
const order = (i: number) => ({ '--i': i }) as CSSProperties;

/** How long a preview "applies" before it shows as live. */
const APPLY_MS = 900;

/**
 * The hero preview cycles through modules every 5 s until someone picks one.
 * Each switch plays out like a real save: Sparko types, then the message
 * lands and the status turns live.
 */
function HeroStage() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(reducedMotion);
  const [instant] = useState(reducedMotion);
  const scene = scenes[index] ?? scenes[0]!;
  const [appliedKey, setAppliedKey] = useState(scene.key);
  const live = instant || appliedKey === scene.key;
  const frame = useTilt<HTMLDivElement>(6);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % scenes.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    const timer = setTimeout(() => setAppliedKey(scene.key), APPLY_MS);
    return () => clearTimeout(timer);
  }, [scene.key]);

  return (
    <div className="sw-stage">
      <div className="sw-stage__bar">
        <Segmented
          label="Preview a module"
          className="sw-stage__tabs"
          value={scene.key}
          onChange={(key) => {
            setIndex(scenes.findIndex((s) => s.key === key));
            setPaused(true);
          }}
          options={scenes.map((s) => ({ value: s.key, label: s.label }))}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={paused ? 'arrow-right' : 'circle-pause'}
          aria-label={
            paused ? 'Play the preview tour' : 'Pause the preview tour'
          }
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        />
      </div>
      <div className="sw-stage__frame sw-tilt" ref={frame}>
        <div className="sw-stage__chan">
          <Icon name="hash" />
          {scene.channel}
        </div>
        <div className="dc-chat dc-preview-frame" aria-live="polite">
          {scene.user && (
            <div className="dc-msg">
              <div
                className="dc-avatar"
                style={{ background: 'oklch(0.86 0.08 230)' }}
              >
                {scene.user[0]?.toUpperCase()}
              </div>
              <div className="dc-head">
                <span className="dc-name">{scene.user}</span>
                <span className="dc-time">Today at 18:41</span>
              </div>
              <div className="dc-content">{scene.userText}</div>
            </div>
          )}
          {live ? (
            <DiscordMessage
              key={scene.key}
              className="sw-swap"
              content={
                scene.content && (
                  <>
                    <span className="dc-mention">{scene.mention}</span>{' '}
                    {scene.content}
                  </>
                )
              }
              embed={{
                color: scene.color,
                author: 'Pixel Plaza',
                title: scene.title,
                description: scene.description,
                fields: scene.fields.map(([name, value]) => ({
                  name,
                  value,
                  inline: true,
                })),
                footer: scene.footer,
              }}
              components={[scene.buttons]}
            />
          ) : (
            <p className="sw-typing">
              <span className="sw-typing__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                <b>Sparko</b> is typing…
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="sw-stage__foot">
        <span
          className={'sp-sync sp-sync--' + (live ? 'live' : 'applying')}
          role="status"
        >
          {live ? <Icon name="circle-check" size="sm" /> : <Spinner />}
          {live ? `Live in #${scene.channel}` : 'Applying to Discord…'}
        </span>
        <p className="sw-stage__note">{scene.note}</p>
      </div>
    </div>
  );
}

const pipeline = ['Saved', 'Applied to Discord', 'Live in #welcome'];

/** Press save and watch the same three steps the dashboard shows. */
function StatusDemo() {
  // How many steps are done: from -1 (not saved yet) to the last step.
  const last = pipeline.length - 1;
  const [done, setDone] = useState(last);
  const running = done < last;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setDone((d) => d + 1), 650);
    return () => clearTimeout(timer);
  }, [running, done]);
  const run = () => setDone(reducedMotion() ? last : -1);
  return (
    <div className="sw-status">
      <ol className="sw-status__steps" aria-live="polite">
        {pipeline.map((step, i) => {
          const state =
            i <= done
              ? 'is-done'
              : i === done + 1 && running
                ? 'is-current'
                : '';
          return (
            <li key={step} className={'sw-status__step ' + state}>
              <span className="sw-status__dot" aria-hidden="true">
                {i <= done ? (
                  <Icon name="check" size="sm" />
                ) : i === done + 1 && running ? (
                  <Spinner />
                ) : null}
              </span>
              <span>
                {step}
                <span className="sp-sr-only">
                  {i <= done ? ', done' : running ? ', waiting' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <Button
        size="sm"
        icon="save"
        onClick={run}
        disabled={running}
        className="sw-status__btn"
      >
        {running ? 'Saving…' : 'Save again'}
      </Button>
    </div>
  );
}

function WhyGrid() {
  const [rejoin, setRejoin] = useState(false);
  const [message, setMessage] = useState('welcome to {server}!');
  const preview = message
    .replace(/\{server\}/g, 'Pixel Plaza')
    .replace(/\{user\}/g, '@tomoko');
  return (
    <div className="sw-bento">
      <Tilt as="article" max={4} className="sw-card sw-bento__live sw-reveal">
        <div className="sw-bento__copy">
          <h3 className="sw-h3">Live previews</h3>
          <p className="sw-body">
            Messages look exactly like they will in Discord, before you save.
            Try it: <code className="sp-mono">{'{server}'}</code> and{' '}
            <code className="sp-mono">{'{user}'}</code> fill themselves in.
          </p>
          <div className="sp-input">
            <input
              aria-label="Try a welcome message"
              value={message}
              maxLength={120}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <div className="dc-chat sw-bento__dc" aria-label="Discord preview">
          <DiscordMessage
            content={
              <>
                <span className="dc-mention">@tomoko</span> {preview}
              </>
            }
          />
        </div>
      </Tilt>

      <Tilt as="article" max={4} className="sw-card sw-bento__plain sw-reveal">
        <h3 className="sw-h3">Plain language</h3>
        <p className="sw-body">
          No jargon, no raw JSON. Every setting says what it does.
        </p>
        <div className="sw-card__demo">
          <Switch
            checked={rejoin}
            onChange={setRejoin}
            label="Welcome people who rejoin"
            description="Off means nobody is greeted twice."
          />
        </div>
      </Tilt>

      <Tilt as="article" max={4} className="sw-card sw-bento__safe sw-reveal">
        <h3 className="sw-h3">Safe by default</h3>
        <p className="sw-body">
          Test rules in a simulator before they’re live. Restore any earlier
          setup.
        </p>
        <div className="sw-card__demo">
          <code className="sp-mono sw-sim__msg">
            “free nitro → discord.gg/x7f”
          </code>
          <Badge tone="danger" icon="ban" style={{ justifySelf: 'start' }}>
            Would be removed · Invite links
          </Badge>
        </div>
      </Tilt>

      <Tilt as="article" max={4} className="sw-card sw-bento__status sw-reveal">
        <div className="sw-bento__copy">
          <h3 className="sw-h3">Honest status</h3>
          <p className="sw-body">
            You always know if it’s saved, applying, live, or what to fix.
          </p>
        </div>
        <StatusDemo />
      </Tilt>
    </div>
  );
}

/** Module groups orbit the heading: the top arc runs one way, the bottom the other. */
function ModuleOrbit() {
  const stage = useOnScreenClass<HTMLDivElement>('is-moving');
  useOrbitControl(stage);
  // Each group goes round twice so both arcs stay full. The second lap is
  // shifted half a lap, so the top and bottom arcs show different groups.
  // The copies are hidden from screen readers and the keyboard.
  const half = Math.floor(groups.length / 2);
  const ring = [...groups, ...groups.slice(half), ...groups.slice(0, half)];
  return (
    <section className="sw-orbit" aria-labelledby="mods-h">
      <div
        className="sw-orbit__stage"
        ref={stage}
        style={{ '--n': ring.length } as CSSProperties}
      >
        <div className="sw-orbit__center">
          <h2 className="sw-h2" id="mods-h">
            Everything your server needs, grouped the way you think.
          </h2>
          <p className="sw-lede">
            {modules.length} modules in {groups.length} groups, all in one
            dashboard.
          </p>
          <Link className="sp-btn sp-btn--secondary sw-btn-link" to="/features">
            Browse every module
            <Icon name="arrow-right" size="sm" />
          </Link>
        </div>
        <ul className="sw-orbit__ring">
          {ring.map((group, i) => {
            const copy = i >= groups.length;
            const count = modules.filter((m) => m.group === group).length;
            return (
              <li
                key={i}
                className="sw-orbit__item"
                style={order(i)}
                aria-hidden={copy || undefined}
              >
                <Link
                  className="sw-orbit__card"
                  to={`/features?group=${encodeURIComponent(group)}`}
                  tabIndex={copy ? -1 : undefined}
                  draggable={false}
                >
                  <span className="sw-orbit__icon">
                    <Icon name={groupMeta[group].icon} />
                  </span>
                  <span className="sw-orbit__name">{group}</span>
                  <span className="sw-orbit__blurb">
                    {groupMeta[group].blurb}
                  </span>
                  <span className="sw-orbit__count">
                    {count} {count === 1 ? 'module' : 'modules'}
                    <Icon name="arrow-right" size="sm" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** A soft yellow light that trails the pointer across the hero. */
function HeroGlow() {
  const glow = usePointerGlow<HTMLDivElement>();
  return <div className="sw-hero__glow" ref={glow} aria-hidden="true" />;
}

/** Every slash command, on two ribbons that cross at an angle. */
function CommandRibbons() {
  const ribbons = useOnScreenClass<HTMLDivElement>('is-moving');
  const names = commands.map((c) => c.name);
  const lanes = [names, [...names].reverse()];
  return (
    <div className="sw-ribbons" ref={ribbons} aria-hidden="true">
      {lanes.map((lane, l) => (
        <div key={l} className={`sw-ribbon sw-ribbon--${l ? 'ink' : 'brand'}`}>
          <div className="sw-ribbon__track">
            {[...lane, ...lane].map((name, i) => (
              <span key={i} className="sw-ribbon__item">
                {name}
                <i className="sw-ribbon__spark" />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomePage() {
  usePageTitle('');
  const { addBot } = useAccountActions();
  return (
    <>
      <div className="sw-progress" aria-hidden="true" />
      <section className="sw-hero" aria-labelledby="hero-h">
        <HeroGlow />
        <div className="sw-wrap sw-hero__grid">
          <div className="sw-hero__copy">
            <h1 className="sw-display" id="hero-h">
              {['The', 'Discord', 'bot', 'that'].map((word, i) => (
                <Fragment key={word}>
                  <span className="sw-word" style={order(i)}>
                    {word}
                  </span>{' '}
                </Fragment>
              ))}
              <span className="sw-word sw-mark" style={order(4)}>
                explains itself.
              </span>
            </h1>
            <p className="sw-lede sw-enter" style={order(5)}>
              Moderation, tickets, welcome messages, levels and 40 more modules.
              Every setting is written in plain language, and you see every
              message exactly as Discord will show it before you save.
            </p>
            <div className="sw-hero__ctas sw-enter" style={order(6)}>
              <Button variant="primary" size="lg" icon="plus" onClick={addBot}>
                Add Sparko to Discord
              </Button>
              <Link
                className="sp-btn sp-btn--secondary sp-btn--lg sw-btn-link"
                to="/features"
              >
                See every feature
              </Link>
            </div>
            <ul className="sw-hero__proof sw-enter" style={order(7)}>
              {[
                'Nearly every module is free',
                'Set up in about 5 minutes',
                'Never asks for Administrator',
                'Undo any change',
              ].map((proof) => (
                <li key={proof}>
                  <Icon name="circle-check" size="sm" />
                  {proof}
                </li>
              ))}
            </ul>
          </div>
          <HeroStage />
        </div>
      </section>

      <CommandRibbons />

      <section className="sw-section sw-band" aria-labelledby="why-h">
        <div className="sw-wrap">
          <div className="sw-head sw-reveal">
            <h2 className="sw-h2" id="why-h">
              Other bots make you guess. Sparko shows you.
            </h2>
          </div>
          <WhyGrid />
        </div>
      </section>

      <ModuleOrbit />

      <section className="sw-section sw-band" aria-labelledby="setup-h">
        <div className="sw-wrap">
          <div className="sw-head sw-reveal">
            <h2 className="sw-h2" id="setup-h">
              From invite to live in about five minutes.
            </h2>
            <p className="sw-lede">
              A guided checklist walks you through the essentials. Skip
              anything, come back later.
            </p>
          </div>
          <div className="sw-timeline-wrap">
            <span className="sw-timeline__rider" aria-hidden="true">
              <i />
            </span>
            <ol className="sw-timeline">
              {[
                [
                  '~30 sec',
                  'Add Sparko',
                  'Sign in with Discord and pick a server. Sparko only asks for the permissions your modules use.',
                ],
                [
                  '~3 min',
                  'Follow the checklist',
                  'Pick a log channel, switch on Auto moderation and write a welcome. Each step shows a preview first.',
                ],
                [
                  'instant',
                  'Go live',
                  'Save and watch it apply. If a permission is missing, Sparko tells you exactly where to fix it.',
                ],
              ].map(([time, title, body], i) => (
                <li
                  key={title}
                  className="sw-timeline__step sw-reveal"
                  style={order(i)}
                >
                  <div className="sw-timeline__n">
                    <b>{i + 1}</b>
                    <span className="sw-step__time">{time}</span>
                  </div>
                  <h3 className="sw-h3">{title}</h3>
                  <p className="sw-body">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="sw-section" aria-labelledby="pt-h">
        <div className="sw-wrap">
          <div className="sw-head sw-head--center">
            <h2 className="sw-h2" id="pt-h">
              Free for nearly everything.
            </h2>
            <p className="sw-lede">
              Plus adds multi-server tools and higher limits, from US$2.99 a
              month billed yearly.
            </p>
          </div>
          <PricingTeaser />
        </div>
      </section>

      <section className="sw-section sw-band" aria-labelledby="faq-h">
        <div className="sw-wrap">
          <div className="sw-head sw-head--center">
            <h2 className="sw-h2" id="faq-h">
              Questions, answered
            </h2>
          </div>
          <Faq items={homeFaq} />
        </div>
      </section>
    </>
  );
}
