/**
 * Reaction roles: a message members react to, or whose buttons or menu they
 * use, to give themselves roles. The message itself is a Message Studio
 * template. Nothing here touches the database or the network, so the
 * dashboard imports this file too.
 */
import { emojiPayload, type ButtonColour } from './studio-format.ts';

export type RRKind = 'reaction' | 'button' | 'menu';
/**
 * normal: pick to get the role, pick again to drop it. unique: one role
 * from the group at a time. add: roles are only ever given. remove: picking
 * takes the role away.
 */
export type RRMode = 'normal' | 'unique' | 'add' | 'remove';
export type RRDelivery = 'channel' | 'dm' | 'both';

export type RRItem = {
  id: string;
  emoji: string;
  /** A button's text, or a menu option's title. */
  label: string;
  /** A menu option's description. */
  description: string;
  colour: ButtonColour;
  /** The role it gives (or takes, in remove mode). */
  role: string;
  /** Only members with this role can use it; '' for anyone. */
  required: string;
  /** Members with this role can't use it; '' for nobody. */
  blacklist: string;
};

export type ReactionRole = {
  /** Where the message goes. */
  channel: string;
  /** The Message Studio template that is the message. */
  message: string;
  kind: RRKind;
  items: RRItem[];
  mode: RRMode;
  /** Most roles from this message one member can have; 0 for no limit. */
  max: number;
  /** Fewest options a member must pick in the menu; 0 for none. */
  min: number;
  /** The menu's text before anything is picked. */
  placeholder: string;
  /** A message to the member when a role is given or taken. */
  response: {
    on: boolean;
    delivery: RRDelivery;
    /** Studio templates sent when a role is given, and when one is taken. */
    claim: string;
    remove: string;
  };
};

/** Most items of each kind: Discord's limits (reactions: 20 per message). */
export const rrLimits: Record<RRKind, number> = {
  reaction: 20,
  button: 25,
  menu: 20,
};

/** How many reaction role messages each plan keeps. */
export const rrTemplateLimit = (plan: 'free' | 'plus' | undefined) =>
  plan === 'plus' ? 50 : 10;

let counter = 0;
export const rrItemId = () =>
  `i${Date.now().toString(36)}${(counter++).toString(36)}`;

export const rrItem = (patch: Partial<RRItem> = {}): RRItem => ({
  id: rrItemId(),
  emoji: '',
  label: '',
  description: '',
  colour: 'blurple',
  role: '',
  required: '',
  blacklist: '',
  ...patch,
});

export const rrDefault = (channel: string, message: string): ReactionRole => ({
  channel,
  message,
  kind: 'reaction',
  items: [rrItem({ emoji: '👍' })],
  mode: 'normal',
  max: 0,
  min: 0,
  placeholder: 'Pick your roles',
  response: { on: false, delivery: 'channel', claim: '', remove: '' },
});

/** One emoji however it was written, to compare them. */
export function emojiKey(e: string) {
  const custom = e.match(/^<a?:\w{1,32}:(\d{1,25})>$/);
  return custom ? custom[1]! : e.replace(/️/g, '');
}

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;

export type RRIssue = { problem: string; at: string };

/**
 * Checks a reaction role from the dashboard. `at` says where the problem
 * is: "channel", "message", "items", "item:<id>", "max", "min" or "response".
 */
export function rrIssue(
  input: unknown,
  known?: { templates?: Set<string>; roles?: Map<string, boolean> },
): RRIssue | null {
  const r = input as Partial<ReactionRole> | null;
  const at = (problem: string, where: string) => ({ problem, at: where });
  if (!r || typeof r !== 'object')
    return at('The reaction role is missing.', 'items');
  if (!snowflake.test(r.channel ?? ''))
    return at('Pick a channel to post it in.', 'channel');
  if (!templateId.test(r.message ?? ''))
    return at('Pick the message to post.', 'message');
  if (known?.templates && !known.templates.has(r.message!))
    return at('Its message template was deleted. Pick another.', 'message');
  if (!['reaction', 'button', 'menu'].includes(r.kind as string))
    return at('Pick reactions, buttons or a menu.', 'items');
  const kind = r.kind!;
  const items = r.items;
  if (!Array.isArray(items) || !items.length)
    return at(`Add at least one ${kindName[kind]}.`, 'items');
  if (items.length > rrLimits[kind])
    return at(
      `Discord allows up to ${rrLimits[kind]} ${kindName[kind]}s.`,
      'items',
    );
  const seen = new Set<string>();
  for (const i of items as RRItem[]) {
    const where = `item:${i?.id}`;
    if (!i || typeof i !== 'object' || !templateId.test(i.id))
      return at('An item is damaged. Remove it and add it again.', 'items');
    for (const key of ['emoji', 'label', 'description', 'role'] as const)
      if (typeof i[key] !== 'string')
        return at('Some settings are missing.', where);
    if (kind === 'reaction') {
      if (!i.emoji) return at('Give each reaction an emoji.', where);
      const k = emojiKey(i.emoji);
      if (seen.has(k))
        return at('Two reactions use the same emoji. Pick another.', where);
      seen.add(k);
    }
    if (kind === 'button') {
      if (!i.label.trim() && !i.emoji)
        return at('Give the button a name or an emoji.', where);
      if (i.label.length > 80)
        return at('Button names hold 80 characters.', where);
      if (!['blurple', 'grey', 'green', 'red'].includes(i.colour))
        return at('Pick a colour for the button.', where);
    }
    if (kind === 'menu') {
      if (!i.label.trim()) return at('Give each option a title.', where);
      if (i.label.length > 100 || i.description.length > 100)
        return at('Titles and descriptions hold 100 characters.', where);
    }
    if (!snowflake.test(i.role)) return at('Pick the role it gives.', where);
    for (const extra of [i.required, i.blacklist])
      if (typeof extra !== 'string' || (extra && !snowflake.test(extra)))
        return at('Some settings are missing.', where);
    if (i.required && i.required === i.blacklist)
      return at('A role can’t be both required and blacklisted.', where);
    if (known?.roles && known.roles.get(i.role) === false)
      return at(
        'Sparko can’t give that role. Move its role above it, or pick another.',
        where,
      );
  }
  if (!['normal', 'unique', 'add', 'remove'].includes(r.mode as string))
    return at('Pick how roles are given.', 'mode');
  const whole = (n: unknown) => typeof n === 'number' && Number.isInteger(n);
  if (!whole(r.max) || r.max! < 0 || r.max! > items.length)
    return at(`Max picks must be 0 to ${items.length}.`, 'max');
  if (!whole(r.min) || r.min! < 0 || r.min! > (r.max || items.length))
    return at('Min picks can’t be more than max picks.', 'min');
  if (typeof r.placeholder !== 'string' || r.placeholder.length > 150)
    return at('The menu text holds 150 characters.', 'items');
  const res = r.response;
  if (
    !res ||
    typeof res.on !== 'boolean' ||
    !['channel', 'dm', 'both'].includes(res.delivery) ||
    typeof res.claim !== 'string' ||
    typeof res.remove !== 'string'
  )
    return at('Some response settings are missing.', 'response');
  if (res.on && !res.claim && !res.remove)
    return at('Pick a response message, or turn the response off.', 'response');
  for (const t of [res.claim, res.remove])
    if (t && known?.templates && !known.templates.has(t))
      return at('A response template was deleted. Pick another.', 'response');
  return null;
}

const kindName: Record<RRKind, string> = {
  reaction: 'reaction',
  button: 'button',
  menu: 'menu option',
};

/** Keeps only the known fields, so nothing else is stored. */
export function cleanRR(r: ReactionRole): ReactionRole {
  return {
    channel: r.channel,
    message: r.message,
    kind: r.kind,
    items: r.items.map((i) => ({
      id: i.id,
      emoji: i.emoji,
      label: i.label,
      description: i.description,
      colour: i.colour,
      role: i.role,
      required: i.required,
      blacklist: i.blacklist,
    })),
    mode: r.mode,
    max: r.max,
    min: r.kind === 'menu' ? r.min : 0,
    placeholder: r.placeholder,
    response: {
      on: r.response.on,
      delivery: r.response.delivery,
      claim: r.response.claim,
      remove: r.response.remove,
    },
  };
}

// On Discord ------------------------------------------------------------------

export const rrButtonPrefix = 'rr:b:';
export const rrMenuId = 'rr:m';
const buttonStyles = { blurple: 1, grey: 2, green: 3, red: 4 } as const;

/** The rows of buttons, or the menu, under the message. */
export function rrComponents(r: ReactionRole) {
  if (r.kind === 'button') {
    const rows: object[] = [];
    for (let i = 0; i < r.items.length; i += 5)
      rows.push({
        type: 1,
        components: r.items.slice(i, i + 5).map((b) => ({
          type: 2,
          style: buttonStyles[b.colour],
          custom_id: `${rrButtonPrefix}${b.id}`,
          ...(b.label.trim() ? { label: b.label.slice(0, 80) } : {}),
          ...(b.emoji ? { emoji: emojiPayload(b.emoji) } : {}),
        })),
      });
    return rows;
  }
  if (r.kind === 'menu') {
    const unique = r.mode === 'unique';
    const most = unique ? 1 : r.max || r.items.length;
    return [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: rrMenuId,
            ...(r.placeholder.trim()
              ? { placeholder: r.placeholder.slice(0, 150) }
              : {}),
            min_values: Math.min(r.min, most),
            max_values: most,
            options: r.items.map((o) => ({
              label: o.label.slice(0, 100),
              value: o.id,
              ...(o.description.trim()
                ? { description: o.description.slice(0, 100) }
                : {}),
              ...(o.emoji ? { emoji: emojiPayload(o.emoji) } : {}),
            })),
          },
        ],
      },
    ];
  }
  return [];
}

/** An emoji as Discord's reaction endpoints want it in the path. */
export function reactionPath(e: string) {
  const custom = e.match(/^<a?:(\w{1,32}):(\d{1,25})>$/);
  return encodeURIComponent(custom ? `${custom[1]}:${custom[2]}` : e);
}

// Who gets what ---------------------------------------------------------------

export type RRAction =
  | { kind: 'react'; item: string }
  | { kind: 'unreact'; item: string }
  | { kind: 'button'; item: string }
  | { kind: 'menu'; items: string[] };

export type RROutcome = {
  give: string[];
  take: string[];
  /** Items the member can't use, and why, in words for them. */
  refused: { item: RRItem; reason: string }[];
};

/**
 * Works out which roles to give and take for something a member did, from
 * the roles they already have. Nothing is applied here.
 */
export function rrDecide(
  r: ReactionRole,
  action: RRAction,
  has: Set<string>,
  roleName: (id: string) => string = (id) => `<@&${id}>`,
): RROutcome {
  const out: RROutcome = { give: [], take: [], refused: [] };
  const byId = new Map(r.items.map((i) => [i.id, i]));
  const group = new Set(r.items.map((i) => i.role));
  const allowed = (i: RRItem) => {
    if (i.required && !has.has(i.required)) {
      out.refused.push({
        item: i,
        reason: `You need the ${roleName(i.required)} role for this.`,
      });
      return false;
    }
    if (i.blacklist && has.has(i.blacklist)) {
      out.refused.push({
        item: i,
        reason: `Members with ${roleName(i.blacklist)} can’t pick this.`,
      });
      return false;
    }
    return true;
  };
  const held = () => [...group].filter((g) => has.has(g));
  /** Gives one role, as the mode and the max allow. */
  const give = (i: RRItem) => {
    if (has.has(i.role)) return;
    if (r.mode === 'unique') {
      out.take.push(...held().filter((g) => g !== i.role));
    } else if (r.max && held().length >= r.max) {
      out.refused.push({
        item: i,
        reason: `You can have up to ${r.max} of these roles. Remove one first.`,
      });
      return;
    }
    out.give.push(i.role);
  };

  if (action.kind === 'menu') {
    const picked = action.items
      .map((id) => byId.get(id))
      .filter((i): i is RRItem => !!i)
      .filter(allowed);
    const roles = new Set(picked.map((i) => i.role));
    if (r.mode === 'remove') {
      out.take.push(...[...roles].filter((g) => has.has(g)));
      return out;
    }
    if (r.max && r.mode !== 'unique' && roles.size > r.max) {
      out.refused.push({
        item: picked[0]!,
        reason: `You can have up to ${r.max} of these roles.`,
      });
      return out;
    }
    out.give.push(...[...roles].filter((g) => !has.has(g)));
    // Picking from the menu sets the member's roles from it, except in
    // add-only mode, where nothing is taken away.
    if (r.mode !== 'add') out.take.push(...held().filter((g) => !roles.has(g)));
    return out;
  }

  const item = byId.get(action.item);
  if (!item) return out;
  if (action.kind === 'unreact') {
    // Only a plain or one-at-a-time reaction gives the role back up.
    if ((r.mode === 'normal' || r.mode === 'unique') && has.has(item.role))
      out.take.push(item.role);
    return out;
  }
  if (!allowed(item)) return out;
  if (r.mode === 'remove') {
    if (has.has(item.role)) out.take.push(item.role);
    else
      out.refused.push({
        item,
        reason: `You don’t have ${roleName(item.role)}.`,
      });
    return out;
  }
  if (action.kind === 'button' && has.has(item.role)) {
    if (r.mode === 'add')
      out.refused.push({
        item,
        reason: `You already have ${roleName(item.role)}.`,
      });
    else out.take.push(item.role);
    return out;
  }
  give(item);
  return out;
}

/**
 * {role-list}: each role with its emoji, one per line, as
 * "> 🎮 | @Gamer", "> 🎮 Gamer | @Gamer" for buttons, and under the menu's
 * text in bold for a menu.
 */
export function rrRoleList(r: ReactionRole) {
  const line = (i: RRItem) => {
    const name = r.kind === 'reaction' ? '' : i.label.trim();
    const lead = [i.emoji, name].filter(Boolean).join(' ');
    return `> ${lead ? `${lead} | ` : ''}<@&${i.role}>`;
  };
  const lines = r.items.filter((i) => i.role).map(line);
  return r.kind === 'menu' && r.placeholder.trim()
    ? [`**${r.placeholder.trim()}**`, ...lines].join('\n')
    : lines.join('\n');
}
