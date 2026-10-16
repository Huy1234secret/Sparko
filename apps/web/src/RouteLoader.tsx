import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router-dom';
import { Crystal, preloadCrystal } from './ui';
import { freeModuleCount, modules } from './content/modules';

// Get the player and the crystal ready early, so the loader never waits on
// its own animation.
preloadCrystal();

const facts = [
  'Sparko never asks for Administrator, only the permissions your modules use.',
  'Every save is kept as a version you can go back to.',
  'Message Studio shows messages exactly as Discord will, in dark and light.',
  'An embed can hold up to 6,000 characters across all of its parts.',
  'A Discord message can have up to 5 rows of buttons.',
  'Timed roles can wait anywhere from 1 minute to 2 years.',
  'The ticket inbox puts members who have waited over an hour first.',
  '{user} mentions a member without pinging them.',
  `${freeModuleCount} of Sparko’s ${modules.length} modules are free.`,
  'Discord IDs are “snowflakes”: they quietly record when something was made.',
  'Discord’s blurple is #5865F2. Sparko’s yellow is #FACC15.',
  'Reaction roles can use reactions, buttons or a dropdown menu.',
  'Welcome messages can go to a channel, a DM, or both at once.',
  'Automatic roles check every member once a minute.',
];

/**
 * While a page's code loads, a loading screen fades in over the current page
 * instead of the site seeming to freeze. It waits a moment first, so fast
 * page changes never flash it.
 */
export function RouteLoader() {
  const navigation = useNavigation();
  const key = navigation.location?.key ?? null;
  const [ready, setReady] = useState<{ key: string; fact: string } | null>(
    null,
  );
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(
      () =>
        setReady({
          key,
          fact: facts[Math.floor(Math.random() * facts.length)] ?? facts[0]!,
        }),
      120,
    );
    return () => clearTimeout(timer);
  }, [key]);
  const on = navigation.state === 'loading' && ready?.key === key;
  return (
    <div
      className={'sp-route-loader' + (on ? ' is-on' : '')}
      role="status"
      aria-live="polite"
      aria-hidden={!on}
    >
      {on && (
        <div className="sp-route-loader__card">
          <span className="sp-route-loader__icon">
            <Crystal />
          </span>
          <p className="sp-route-loader__title">
            Loading
            <span className="sp-route-loader__dots" aria-hidden="true">
              <i>.</i>
              <i>.</i>
              <i>.</i>
            </span>
          </p>
          <p className="sp-route-loader__fact">
            <b>Did you know?</b> {ready.fact}
          </p>
        </div>
      )}
    </div>
  );
}
