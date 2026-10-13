import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, DiscordMessage, Icon, Segmented, Switch } from '../ui';
import { groupMeta, groups, modules } from '../content/modules';
import { homeFaq, scenes } from '../content/site';
import { Faq, PricingTeaser } from './parts';
import { useAccountActions, usePageTitle } from './SiteLayout';

const reducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The hero preview cycles through modules every 5 s until someone picks one. */
function HeroStage() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(reducedMotion);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % scenes.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused]);
  const scene = scenes[index] ?? scenes[0]!;
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
      <div className="sw-stage__frame">
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
        </div>
      </div>
      <p className="sw-stage__note">{scene.note}</p>
    </div>
  );
}

function WhyCards() {
  const [rejoin, setRejoin] = useState(false);
  const [message, setMessage] = useState('welcome to {server}!');
  const preview = message
    .replace(/\{server\}/g, 'Pixel Plaza')
    .replace(/\{user\}/g, '@tomoko');
  return (
    <div className="sw-grid sw-grid--4">
      <article className="sw-card">
        <span className="sw-card__icon">
          <Icon name="message-square-text" />
        </span>
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
      </article>
      <article className="sw-card">
        <span className="sw-card__icon">
          <Icon name="eye" />
        </span>
        <h3 className="sw-h3">Live previews</h3>
        <p className="sw-body">
          Messages look exactly like they will in Discord, before you save.
        </p>
        <div className="sw-card__demo">
          <div className="sp-input" style={{ minHeight: 36, fontSize: 13 }}>
            <input
              aria-label="Try a welcome message"
              value={message}
              maxLength={120}
              onChange={(e) => setMessage(e.target.value)}
              style={{ height: 34 }}
            />
          </div>
          <div className="sw-demo-dc">
            <span className="dc-mention">@tomoko</span> {preview}
          </div>
        </div>
      </article>
      <article className="sw-card">
        <span className="sw-card__icon">
          <Icon name="shield-check" />
        </span>
        <h3 className="sw-h3">Safe by default</h3>
        <p className="sw-body">
          Test rules in a simulator before they’re live. Restore any earlier
          setup.
        </p>
        <div className="sw-card__demo">
          <code
            className="sp-mono"
            style={{ fontSize: 12, color: 'var(--sp-muted)' }}
          >
            “free nitro → discord.gg/x7f”
          </code>
          <Badge tone="danger" icon="ban" style={{ justifySelf: 'start' }}>
            Would be removed · Invite links
          </Badge>
        </div>
      </article>
      <article className="sw-card">
        <span className="sw-card__icon">
          <Icon name="activity" />
        </span>
        <h3 className="sw-h3">Honest status</h3>
        <p className="sw-body">
          You always know if it’s saved, applying, live, or what to fix.
        </p>
        <div className="sw-card__demo sw-status-demo">
          {['Saved', 'Applied to Discord', 'Live in #welcome'].map((step) => (
            <span key={step}>
              <Icon name="circle-check" size="sm" />
              {step}
            </span>
          ))}
        </div>
      </article>
    </div>
  );
}

export function HomePage() {
  usePageTitle('');
  const { addBot } = useAccountActions();
  const navigate = useNavigate();
  return (
    <>
      <section className="sw-hero" aria-labelledby="hero-h">
        <div className="sw-wrap sw-hero__grid">
          <div className="sw-hero__copy">
            <Badge
              tone="brand"
              pill
              icon="sparkles"
              style={{
                justifySelf: 'start',
                height: 30,
                padding: '0 12px 0 10px',
                fontSize: 13,
              }}
            >
              Nearly every module is free
            </Badge>
            <h1 className="sw-display" id="hero-h">
              The Discord bot that{' '}
              <span className="sw-mark">explains itself.</span>
            </h1>
            <p className="sw-lede">
              Moderation, tickets, welcome messages, levels and 40 more modules.
              Every setting is written in plain language, and you see every
              message exactly as Discord will show it before you save.
            </p>
            <div className="sw-hero__ctas">
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
            <div className="sw-hero__proof">
              {[
                'Set up in about 5 minutes',
                'Never asks for Administrator',
                'Undo any change',
              ].map((proof) => (
                <span key={proof}>
                  <Icon name="circle-check" size="sm" />
                  {proof}
                </span>
              ))}
            </div>
          </div>
          <HeroStage />
        </div>
      </section>

      <section className="sw-section sw-band" aria-labelledby="why-h">
        <div className="sw-wrap">
          <div className="sw-head">
            <span className="sw-eyebrow">Why servers switch</span>
            <h2 className="sw-h2" id="why-h">
              Other bots make you guess. Sparko shows you.
            </h2>
          </div>
          <WhyCards />
        </div>
      </section>

      <section className="sw-section" aria-labelledby="mods-h">
        <div className="sw-wrap">
          <div className="sw-head">
            <span className="sw-eyebrow">
              {modules.length} modules, one dashboard
            </span>
            <h2 className="sw-h2" id="mods-h">
              Everything your server needs, grouped the way you think.
            </h2>
          </div>
          <div className="sw-grid sw-grid--4">
            {groups.map((group) => {
              const items = modules.filter((m) => m.group === group);
              return (
                <button
                  key={group}
                  type="button"
                  className="sw-card sw-card--link"
                  onClick={() =>
                    navigate(`/features?group=${encodeURIComponent(group)}`)
                  }
                >
                  <span className="sw-card__icon sw-card__icon--plain">
                    <Icon name={groupMeta[group].icon} />
                  </span>
                  <span style={{ display: 'grid', gap: 4 }}>
                    <span className="sw-h3">{group}</span>
                    <span className="sw-body" style={{ fontSize: 14 }}>
                      {groupMeta[group].blurb}
                    </span>
                  </span>
                  <span className="sw-chips">
                    {items.slice(0, 3).map((m) => (
                      <span key={m.id} className="sp-badge">
                        {m.label}
                      </span>
                    ))}
                  </span>
                  <span className="sw-more">
                    {items.length > 3
                      ? `All ${items.length} modules`
                      : 'See details'}
                    <Icon name="arrow-right" size="sm" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sw-section sw-band" aria-labelledby="setup-h">
        <div className="sw-wrap">
          <div className="sw-head">
            <span className="sw-eyebrow">Setup in minutes</span>
            <h2 className="sw-h2" id="setup-h">
              From invite to live in about five minutes.
            </h2>
            <p className="sw-lede">
              A guided checklist walks you through the essentials. Skip
              anything, come back later.
            </p>
          </div>
          <ol className="sw-steps">
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
              <li key={title} className="sw-step">
                <div className="sw-step__n">
                  <b>{i + 1}</b>
                  <span className="sw-step__time">{time}</span>
                </div>
                <h3 className="sw-h3">{title}</h3>
                <p className="sw-body">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sw-section" aria-labelledby="pt-h">
        <div className="sw-wrap">
          <div className="sw-head sw-head--center">
            <span className="sw-eyebrow">Pricing</span>
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
