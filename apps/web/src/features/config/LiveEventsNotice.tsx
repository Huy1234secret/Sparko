import { Notice } from '@sparko/ui';

/**
 * States the live-Gateway limit honestly: these features act only on events
 * Discord delivers while the bot is connected; missed events are not replayed.
 */
export function LiveEventsNotice({
  what,
  events,
  intent,
}: {
  /** What the feature does, e.g. "XP is awarded". */
  what: string;
  /** Which Discord events it needs, e.g. "messages". */
  events: string;
  /** A privileged intent Discord must grant, if any. */
  intent?: string;
}) {
  return (
    <Notice tone="info" title="Works from live Discord events">
      {what} only while the Sparko bot is connected and Discord sends it{' '}
      {events}. Anything that happens while the bot is offline is not counted
      later.
      {intent && ` This also needs the ${intent} intent enabled for Sparko.`}
    </Notice>
  );
}
