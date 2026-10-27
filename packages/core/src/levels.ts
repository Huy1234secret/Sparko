/**
 * Levels & XP: members earn XP for chatting and for time in voice, climb
 * levels by an XP equation the server writes, get reward roles at the levels it
 * sets, and race to open XP crates that drop in chat. Level-ups, rank cards
 * and crates are Message Studio templates. Nothing here touches the
 * database or the network, so the dashboard imports this file too.
 */
import { formatDuration, parseDuration } from './auto-roles.ts';
import { commandName } from './suggestions.ts';
import {
  componentRows,
  embedDefault,
  studioPayload,
  v2Default,
  type StudioMessage,
  type StudioVars,
} from './studio-format.ts';

export const LV_MODULE = 'levels';

/** The three messages: a level-up, the /rank card, and an XP crate drop. */
export type LvKind = 'levelup' | 'rank' | 'crate';
export const lvKinds: LvKind[] = ['levelup', 'rank', 'crate'];

/** Where a level-up is announced. */
export type LvAnnounce = 'off' | 'same' | 'channel' | 'dm';
export const lvAnnounces: LvAnnounce[] = ['same', 'channel', 'dm', 'off'];

/** More (or less) XP for members with a role, or in a channel. */
export type LvBoost = {
  id: string;
  kind: 'role' | 'channel';
  /** The role's or channel's id. */
  target: string;
  /** 0.1 to 5; 2 doubles XP. */
  multiplier: number;
};

/** "Level N → role". */
export type LvReward = { id: string; level: number; role: string };

export type LvCommandKey = 'rank' | 'leaderboard' | 'xp';
export type LvCommand = { on: boolean; name: string; description: string };

export type Levels = {
  /** XP for chatting: a random amount from min to max, once per cooldown. */
  message: { on: boolean; min: number; max: number; cooldown: number };
  /** XP for each minute in a voice channel. */
  voice: {
    on: boolean;
    perMinute: number;
    /** Only when someone else is in the channel too. */
    needOthers: boolean;
    /** Not while muted or deafened. */
    skipMuted: boolean;
  };
  /** The XP each level needs, with x for the level, like 5*x^2 + 40*x + 55. */
  formula: string;
  /** The highest level; XP still counts past it. */
  maxLevel: number;
  /** Channels (and their threads) and roles that never earn XP. */
  noXpChannels: string[];
  noXpRoles: string[];
  boosts: LvBoost[];
  levelUp: {
    where: LvAnnounce;
    /** Where it's posted when `where` is "channel". */
    channel: string;
    /** The Studio template; '' for Sparko's own. */
    template: string;
    /** Announce every level, or only every Nth (5: levels 5, 10, 15…). */
    every: number;
  };
  rewards: LvReward[];
  /** Keep every reward earned, or only the highest. */
  stackRewards: boolean;
  /** Take a reward back when someone drops below its level. */
  removeRewards: boolean;
  /** XP crates: surprise drops the first member to open wins. */
  crates: {
    on: boolean;
    /** Where they can drop; [] for anywhere members earn XP. */
    channels: string[];
    /** The chance a message drops one, in percent. */
    chance: number;
    /** The shortest time between drops in a channel, like "10mi". */
    cooldown: string;
    min: number;
    max: number;
    /** Seconds before an unopened crate vanishes. */
    time: number;
    template: string;
  };
  rank: {
    template: string;
    /** /rank answers for everyone to see, or only the member. */
    public: boolean;
  };
  /** Roles that can change XP with /xp; [] for Manage Server. */
  staff: string[];
  commands: Record<LvCommandKey, LvCommand>;
};

export const lvCommandKeys: LvCommandKey[] = ['rank', 'leaderboard', 'xp'];
export const lvStaffCommands: LvCommandKey[] = ['xp'];
export const lvCommandAbout: Record<LvCommandKey, string> = {
  rank: 'Shows a member’s rank card: their level, XP, place and progress.',
  leaderboard: 'The server’s top members by XP, 10 to a page.',
  xp: 'Staff give, take or set a member’s XP, or reset it. Its parts are give, take, set and reset.',
};

export const lvDefaultCommands = (): Levels['commands'] => ({
  rank: { on: true, name: 'rank', description: 'See your rank card' },
  leaderboard: {
    on: true,
    name: 'leaderboard',
    description: 'The most active members',
  },
  xp: { on: true, name: 'xp', description: 'Staff: change members’ XP' },
});

export const lvDefault = (channel = ''): Levels => ({
  message: { on: true, min: 15, max: 25, cooldown: 60 },
  voice: { on: true, perMinute: 5, needOthers: true, skipMuted: true },
  formula: LV_FORMULA,
  maxLevel: 100,
  noXpChannels: [],
  noXpRoles: [],
  boosts: [],
  levelUp: { where: 'same', channel, template: '', every: 1 },
  rewards: [],
  stackRewards: true,
  removeRewards: true,
  crates: {
    on: false,
    channels: [],
    chance: 2,
    cooldown: '10mi',
    min: 50,
    max: 150,
    time: 60,
    template: '',
  },
  rank: { template: '', public: true },
  staff: [],
  commands: lvDefaultCommands(),
});

/** What each plan allows. */
export const lvLimits = (plan?: string | null) =>
  plan === 'plus' ? { rewards: 50, boosts: 25 } : { rewards: 5, boosts: 3 };

const MINUTE = 60_000;
export const lvRanges = {
  xp: { min: 1, max: 1000 },
  cooldown: { min: 0, max: 3600 },
  perMinute: { min: 1, max: 100 },
  maxLevel: { min: 1, max: 500 },
  multiplier: { min: 0.1, max: 5 },
  every: { min: 1, max: 100 },
  chance: { min: 0.1, max: 25 },
  crateCooldown: { min: MINUTE, max: 24 * 60 * MINUTE, label: '1mi and 1d' },
  crateXp: { min: 1, max: 100_000 },
  crateTime: { min: 10, max: 600 },
} as const;
/** The most XP staff can give, take or set at once. */
export const LV_MAX_CHANGE = 10_000_000;
/** Leaderboard rows per page in Discord. */
export const LV_PAGE = 10;

// The XP equation -------------------------------------------------------------

/** The XP a level needs, written with x for the level. */
export const LV_FORMULA = '5*x^2 + 40*x + 55';
/** The longest equation, and the most XP one level can need. */
export const LV_FORMULA_MAX = 120;
export const LV_LEVEL_MAX_XP = 100_000_000;

type Node = (x: number) => number;
type Parsed = { fn: Node } | { problem: string };

/**
 * Reads an equation like `5*x^2 + 40*x + 55`: numbers, x, + - * / % ^ and
 * brackets. Nothing is evaluated as code, so any text is safe to read.
 */
export function lvParseFormula(source: string): Parsed {
  const src = source.trim();
  if (!src)
    return { problem: 'Write an equation for the XP each level needs.' };
  if (src.length > LV_FORMULA_MAX)
    return { problem: `Keep the equation under ${LV_FORMULA_MAX} characters.` };
  const tokens =
    src.match(/\d+(?:\.\d+)?|\.\d+|\*\*|[xX]|[-+*/%^()]|\S/g) ?? [];
  let at = 0;
  let usesX = false;
  class Bad extends Error {}
  const fail = (why: string): never => {
    throw new Bad(why);
  };
  const peek = () => tokens[at];
  const near = () => (peek() === undefined ? 'at the end' : `near “${peek()}”`);

  // expr := term (('+' | '-') term)*
  const expr = (): Node => {
    let left = term();
    for (let op = peek(); op === '+' || op === '-'; op = peek()) {
      at++;
      const a = left;
      const b = term();
      left = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  };
  // term := unary (('*' | '/' | '%') unary)*
  const term = (): Node => {
    let left = unary();
    for (let op = peek(); op === '*' || op === '/' || op === '%'; op = peek()) {
      at++;
      const a = left;
      const b = unary();
      left =
        op === '*'
          ? (x) => a(x) * b(x)
          : op === '/'
            ? (x) => a(x) / b(x)
            : (x) => a(x) % b(x);
    }
    return left;
  };
  // unary := ('-' | '+') unary | power
  const unary = (): Node => {
    const op = peek();
    if (op === '-' || op === '+') {
      at++;
      const a = unary();
      return op === '-' ? (x) => -a(x) : a;
    }
    return power();
  };
  // power := primary (('^' | '**') unary)?, so 2^3^2 is 2^(3^2).
  const power = (): Node => {
    const base = primary();
    const op = peek();
    if (op !== '^' && op !== '**') return base;
    at++;
    const exp = unary();
    return (x) => base(x) ** exp(x);
  };
  // primary := number | x | '(' expr ')'
  const primary = (): Node => {
    const t = peek();
    if (t === undefined) return fail('The equation ends too soon.');
    at++;
    if (t === 'x' || t === 'X') {
      usesX = true;
      return (x) => x;
    }
    if (/^(\d|\.\d)/.test(t)) {
      const v = Number(t);
      return () => v;
    }
    if (t === '(') {
      const inner = expr();
      if (peek() !== ')') return fail(`A bracket isn’t closed ${near()}.`);
      at++;
      return inner;
    }
    at--;
    return fail(
      /^[a-z]/i.test(t)
        ? `Use x for the level. “${t}” isn’t something the equation knows.`
        : `Something’s missing ${near()}.`,
    );
  };

  try {
    const fn = expr();
    if (at < tokens.length) return { problem: `Something’s off ${near()}.` };
    if (!usesX)
      return { problem: 'Use x for the level somewhere, like 100*x.' };
    return { fn };
  } catch (e) {
    if (e instanceof Bad) return { problem: e.message };
    throw e;
  }
}

const compiled = new Map<string, Node | null>();
/** The equation as a function, or null when it can't be read. Cached. */
function formulaFn(formula: string): Node | null {
  let fn = compiled.get(formula);
  if (fn === undefined) {
    const p = lvParseFormula(formula);
    fn = 'fn' in p ? p.fn : null;
    if (compiled.size > 500) compiled.clear();
    compiled.set(formula, fn);
  }
  return fn;
}

/**
 * XP to go from `level` to the next one: the equation at x = level + 1,
 * rounded, at least 1. An equation that can't be read uses Sparko's own.
 */
export const lvNeed = (formula: string, level: number) => {
  const fn = formulaFn(formula) ?? formulaFn(LV_FORMULA)!;
  const v = Math.round(fn(level + 1));
  return Number.isFinite(v)
    ? Math.min(LV_LEVEL_MAX_XP, Math.max(1, v))
    : LV_LEVEL_MAX_XP;
};

/** Problems with an equation for these levels, or null. */
export function lvFormulaIssue(formula: unknown, maxLevel: number) {
  if (typeof formula !== 'string')
    return 'Write an equation for the XP each level needs.';
  const p = lvParseFormula(formula);
  if ('problem' in p) return p.problem;
  for (let x = 1; x <= maxLevel; x++) {
    const v = Math.round(p.fn(x));
    if (!Number.isFinite(v))
      return `Level ${x} can’t be worked out with this equation, like a division by 0.`;
    if (v < 1)
      return `Level ${x} would need ${v} XP. Every level has to need at least 1.`;
    if (v > LV_LEVEL_MAX_XP)
      return `Level ${x} would need over ${LV_LEVEL_MAX_XP.toLocaleString('en-US')} XP. Make the equation grow slower.`;
  }
  return null;
}

/** The total XP a level takes, from 0. */
export function lvTotalFor(formula: string, level: number) {
  let total = 0;
  for (let l = 0; l < level; l++) total += lvNeed(formula, l);
  return total;
}

/** Where someone with this much XP is: level, XP into it, XP it needs. */
export function lvProgress(formula: string, xp: number, maxLevel = 500) {
  let level = 0;
  let floor = 0;
  while (level < maxLevel && xp >= floor + lvNeed(formula, level)) {
    floor += lvNeed(formula, level);
    level++;
  }
  const max = level >= maxLevel;
  const need = max ? 0 : lvNeed(formula, level);
  const into = xp - floor;
  return {
    level,
    /** XP past the start of this level. */
    into,
    /** XP this level takes in all. */
    need,
    /** The total XP the next level needs. */
    next: max ? floor : floor + need,
    percent: max ? 100 : Math.floor((into / need) * 100),
    max,
  };
}

/** The level for an amount of XP. */
export const lvLevelOf = (c: Levels, xp: number) =>
  lvProgress(c.formula, xp, c.maxLevel).level;

/** A 10-step bar for how far into a level someone is. */
export const lvBar = (percent: number, width = 10) => {
  const full = Math.floor((Math.max(0, Math.min(100, percent)) / 100) * width);
  return '▰'.repeat(full) + '▱'.repeat(width - full);
};

// Earning ---------------------------------------------------------------------

/** Where XP is earned: a channel, and the channel it's a thread of. */
export type LvPlace = { channelId: string; parentId?: string | null };

/** Whether a member earns XP here. */
export function lvEarns(c: Levels, place: LvPlace, roles: Set<string>) {
  const blocked = new Set(c.noXpChannels);
  if (blocked.has(place.channelId)) return false;
  if (place.parentId && blocked.has(place.parentId)) return false;
  return !c.noXpRoles.some((r) => roles.has(r));
}

/**
 * How much more XP a member gets: their best role boost times the
 * channel's boost (or its parent's, for a thread).
 */
export function lvMultiplier(c: Levels, place: LvPlace, roles: Set<string>) {
  const roleBoosts = c.boosts
    .filter((b) => b.kind === 'role' && roles.has(b.target))
    .map((b) => b.multiplier);
  const role = roleBoosts.length ? Math.max(...roleBoosts) : 1;
  const channel =
    c.boosts.find((b) => b.kind === 'channel' && b.target === place.channelId)
      ?.multiplier ??
    c.boosts.find(
      (b) =>
        b.kind === 'channel' && !!place.parentId && b.target === place.parentId,
    )?.multiplier ??
    1;
  return role * channel;
}

/** A whole number from min to max, both included. */
export const lvRoll = (min: number, max: number, random = Math.random) =>
  min + Math.floor(random() * (max - min + 1));

/** XP for one message, with boosts, at least 1. */
export const lvMessageXp = (
  c: Levels,
  multiplier: number,
  random = Math.random,
) =>
  Math.max(
    1,
    Math.round(lvRoll(c.message.min, c.message.max, random) * multiplier),
  );

/** Whether this level-up is announced, with "every Nth level". */
export const lvShouldAnnounce = (c: Levels, level: number) =>
  c.levelUp.where !== 'off' && level % Math.max(1, c.levelUp.every) === 0;

/**
 * The reward roles someone should have at a level, and which of the ones
 * they have should go. `has` is their roles now.
 */
export function lvRewardPlan(c: Levels, level: number, has: Set<string>) {
  const tiers = [...c.rewards]
    .filter((r) => r.role)
    .sort((a, b) => a.level - b.level);
  const earned = tiers.filter((r) => level >= r.level);
  const keep = new Set(
    (c.stackRewards ? earned : earned.slice(-1)).map((r) => r.role),
  );
  const give = [...keep].filter((id) => !has.has(id));
  const take = [
    ...new Set(
      tiers
        .filter((r) => !keep.has(r.role) && has.has(r.role))
        // Below a tier: only taken back when that's on. A lower tier when
        // only the highest is kept: always swapped for the higher one.
        .filter((r) => c.removeRewards || (!c.stackRewards && level >= r.level))
        .map((r) => r.role),
    ),
  ];
  return { give, take };
}

/** Whether a crate can drop here, at this moment. */
export function lvCrateCanDrop(
  c: Levels,
  place: LvPlace,
  lastDrop: number | null,
  now: number,
) {
  if (!c.crates.on) return false;
  const where = c.crates.channels;
  if (
    where.length &&
    !where.includes(place.channelId) &&
    !(place.parentId && where.includes(place.parentId))
  )
    return false;
  const gap = parseDuration(c.crates.cooldown) ?? 10 * MINUTE;
  return lastDrop === null || now - lastDrop >= gap;
}

// Checks ----------------------------------------------------------------------

export type LvIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const templateId = /^[\w-]{1,40}$/;
const itemId = /^[\w-]{1,40}$/;
const int = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const n = (v: number) => v.toLocaleString('en-US');

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to
 * whether Sparko can give it; `templates` are the server's Studio
 * templates; `channels` are the server's channel ids. Returns the first
 * problem, and where it is.
 */
export function lvIssue(
  input: unknown,
  {
    roles,
    channels,
    templates,
    plan,
  }: {
    roles?: Map<string, boolean>;
    channels?: Set<string>;
    templates?: Set<string>;
    plan?: string | null | undefined;
  } = {},
): LvIssue | null {
  const x = input as Partial<Levels> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const at = (where: string, problem: string) => ({ at: where, problem });
  const limits = lvLimits(plan);
  const r = lvRanges;

  const m = x.message;
  if (!m || typeof m !== 'object' || typeof m.on !== 'boolean') return missing;
  if (!int(m.min, r.xp.min, r.xp.max) || !int(m.max, r.xp.min, r.xp.max))
    return at(
      'message:xp',
      `XP per message has to be a whole number from ${r.xp.min} to ${n(r.xp.max)}.`,
    );
  if (m.min > m.max)
    return at(
      'message:xp',
      'The smallest XP per message can’t be more than the largest.',
    );
  if (!int(m.cooldown, r.cooldown.min, r.cooldown.max))
    return at(
      'message:cooldown',
      `The cooldown has to be from ${r.cooldown.min} to ${n(r.cooldown.max)} seconds.`,
    );

  const v = x.voice;
  if (!v || typeof v !== 'object') return missing;
  for (const k of ['on', 'needOthers', 'skipMuted'] as const)
    if (typeof v[k] !== 'boolean') return missing;
  if (!int(v.perMinute, r.perMinute.min, r.perMinute.max))
    return at(
      'voice:xp',
      `Voice XP has to be from ${r.perMinute.min} to ${r.perMinute.max} a minute.`,
    );

  if (!int(x.maxLevel, r.maxLevel.min, r.maxLevel.max))
    return at(
      'maxLevel',
      `The highest level has to be from ${r.maxLevel.min} to ${r.maxLevel.max}.`,
    );
  const formula = lvFormulaIssue(x.formula, x.maxLevel as number);
  if (formula) return at('formula', formula);

  const idList = (
    list: unknown,
    where: string,
    what: string,
    known: Set<string> | Map<string, boolean> | undefined,
    max = 50,
  ): LvIssue | null => {
    if (!Array.isArray(list)) return missing;
    if (list.length > max) return at(where, `Pick up to ${max} ${what}.`);
    for (const id of list) {
      if (typeof id !== 'string' || !snowflake.test(id)) return missing;
      if (known && !known.has(id))
        return at(
          where,
          `One of the ${what} was deleted. Take it off the list.`,
        );
    }
    return null;
  };
  const lists =
    idList(x.noXpChannels, 'noXpChannels', 'no-XP channels', channels) ??
    idList(x.noXpRoles, 'noXpRoles', 'no-XP roles', roles) ??
    idList(x.staff, 'staff', 'roles in Who can change XP', roles, 25);
  if (lists) return lists;

  if (!Array.isArray(x.boosts)) return missing;
  if (x.boosts.length > limits.boosts)
    return at(
      'boosts',
      `This plan has up to ${limits.boosts} XP ${limits.boosts === 1 ? 'boost' : 'boosts'}.`,
    );
  const boosted = new Set<string>();
  for (const [i, b] of x.boosts.entries()) {
    const where = `boost:${(b as LvBoost | null)?.id ?? i}`;
    if (!b || typeof b !== 'object' || typeof b.id !== 'string') return missing;
    if (!itemId.test(b.id) || (b.kind !== 'role' && b.kind !== 'channel'))
      return missing;
    if (typeof b.target !== 'string' || !snowflake.test(b.target))
      return at(
        where,
        `Pick a ${b.kind === 'role' ? 'role' : 'channel'} for boost ${i + 1}.`,
      );
    if (boosted.has(b.target))
      return at(where, `Boost ${i + 1} is for the same ${b.kind} as another.`);
    boosted.add(b.target);
    const known = b.kind === 'role' ? roles : channels;
    if (known && !known.has(b.target))
      return at(
        where,
        `The ${b.kind} for boost ${i + 1} was deleted. Pick another one.`,
      );
    if (
      typeof b.multiplier !== 'number' ||
      !Number.isFinite(b.multiplier) ||
      b.multiplier < r.multiplier.min ||
      b.multiplier > r.multiplier.max ||
      Math.round(b.multiplier * 10) !== b.multiplier * 10
    )
      return at(
        where,
        `Boost ${i + 1} needs a multiplier from ×${r.multiplier.min} to ×${r.multiplier.max}, in steps of 0.1.`,
      );
  }

  const u = x.levelUp;
  if (!u || typeof u !== 'object') return missing;
  if (!lvAnnounces.includes(u.where)) return missing;
  if (typeof u.channel !== 'string' || typeof u.template !== 'string')
    return missing;
  if (u.channel && !snowflake.test(u.channel)) return missing;
  if (u.where === 'channel' && !u.channel)
    return at('levelUp:channel', 'Pick the channel level-ups are posted in.');
  if (u.where === 'channel' && channels && !channels.has(u.channel))
    return at(
      'levelUp:channel',
      'The level-up channel was deleted. Pick another one.',
    );
  if (!int(u.every, r.every.min, r.every.max))
    return at('levelUp:every', `Announce every 1 to ${r.every.max} levels.`);

  const tpl = (id: unknown, kind: LvKind): LvIssue | null => {
    if (typeof id !== 'string') return missing;
    if (id && !templateId.test(id)) return missing;
    if (id && templates && !templates.has(id))
      return at(
        `message:${kind}`,
        `The ${lvKindNames[kind].toLowerCase()} template was deleted. Pick or make another one.`,
      );
    return null;
  };
  const levelUpTemplate = tpl(u.template, 'levelup');
  if (levelUpTemplate) return levelUpTemplate;

  if (!Array.isArray(x.rewards)) return missing;
  if (x.rewards.length > limits.rewards)
    return at(
      'rewards',
      `This plan has up to ${limits.rewards} reward ${limits.rewards === 1 ? 'role' : 'roles'}.`,
    );
  const levels = new Set<number>();
  const rewardRoles = new Set<string>();
  for (const [i, w] of x.rewards.entries()) {
    const where = `reward:${(w as LvReward | null)?.id ?? i}`;
    if (!w || typeof w !== 'object' || typeof w.id !== 'string') return missing;
    if (!itemId.test(w.id)) return missing;
    if (!int(w.level, 1, x.maxLevel as number))
      return at(
        where,
        `Reward ${i + 1} needs a level from 1 to ${x.maxLevel}, the highest level.`,
      );
    if (levels.has(w.level))
      return at(where, `Two rewards are at level ${w.level}. Change one.`);
    levels.add(w.level);
    if (typeof w.role !== 'string' || !snowflake.test(w.role))
      return at(where, `Pick a role for reward ${i + 1}.`);
    if (rewardRoles.has(w.role))
      return at(
        where,
        'Each reward needs its own role. Pick another one for this reward.',
      );
    rewardRoles.add(w.role);
    if (roles && !roles.has(w.role))
      return at(
        where,
        `The role for reward ${i + 1} was deleted. Pick another one.`,
      );
    if (roles?.get(w.role) === false)
      return at(
        where,
        `Sparko can’t give the role for reward ${i + 1}. Move Sparko’s role above it, or pick another one.`,
      );
  }
  if (typeof x.stackRewards !== 'boolean') return missing;
  if (typeof x.removeRewards !== 'boolean') return missing;

  const c = x.crates;
  if (!c || typeof c !== 'object' || typeof c.on !== 'boolean') return missing;
  const crateChannels = idList(
    c.channels,
    'crates:channels',
    'crate channels',
    channels,
  );
  if (crateChannels) return crateChannels;
  if (
    typeof c.chance !== 'number' ||
    !Number.isFinite(c.chance) ||
    c.chance < r.chance.min ||
    c.chance > r.chance.max
  )
    return at(
      'crates:chance',
      `The drop chance has to be from ${r.chance.min}% to ${r.chance.max}%.`,
    );
  if (typeof c.cooldown !== 'string') return missing;
  const gap = parseDuration(c.cooldown);
  if (gap === null)
    return at(
      'crates:cooldown',
      'Write the time between crates with mi, h or d, like 10mi.',
    );
  if (gap < r.crateCooldown.min || gap > r.crateCooldown.max)
    return at(
      'crates:cooldown',
      `The time between crates has to be between ${r.crateCooldown.label}.`,
    );
  if (
    !int(c.min, r.crateXp.min, r.crateXp.max) ||
    !int(c.max, r.crateXp.min, r.crateXp.max)
  )
    return at(
      'crates:xp',
      `A crate holds a whole number of XP from ${r.crateXp.min} to ${n(r.crateXp.max)}.`,
    );
  if (c.min > c.max)
    return at(
      'crates:xp',
      'The smallest crate can’t hold more XP than the largest.',
    );
  if (!int(c.time, r.crateTime.min, r.crateTime.max))
    return at(
      'crates:time',
      `Crates last ${r.crateTime.min} to ${r.crateTime.max} seconds.`,
    );
  const crateTemplate = tpl(c.template, 'crate');
  if (crateTemplate) return crateTemplate;

  const k = x.rank;
  if (!k || typeof k !== 'object' || typeof k.public !== 'boolean')
    return missing;
  const rankTemplate = tpl(k.template, 'rank');
  if (rankTemplate) return rankTemplate;

  const cmds = x.commands;
  if (!cmds || typeof cmds !== 'object') return missing;
  const used = new Set<string>();
  for (const key of lvCommandKeys) {
    const cmd = cmds[key];
    const where = `command:${key}`;
    if (!cmd || typeof cmd.on !== 'boolean') return missing;
    if (typeof cmd.name !== 'string' || !commandName.test(cmd.name))
      return at(
        where,
        'Command names are 1 to 32 lowercase letters, numbers, - or _.',
      );
    if (used.has(cmd.name))
      return at(where, `Two commands are called /${cmd.name}.`);
    used.add(cmd.name);
    if (
      typeof cmd.description !== 'string' ||
      !cmd.description.trim() ||
      cmd.description.length > 100
    )
      return at(where, `Give /${cmd.name} a description of up to 100.`);
  }
  return null;
}

/** Problems with a crate template next to its Open button, or null. */
export function lvMessageIssue(m: StudioMessage, kind: LvKind): LvIssue | null {
  if (
    kind === 'crate' &&
    m.layout !== 'v2' &&
    componentRows(m.components).length > 4
  )
    return {
      at: 'message',
      problem:
        'The crate’s Open button takes one of Discord’s five rows, so the message can have up to 4 rows of its own.',
    };
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanLevels(c: Levels): Levels {
  const cmd = (k: LvCommandKey) => ({
    on: c.commands[k].on,
    name: c.commands[k].name,
    description: c.commands[k].description.trim(),
  });
  return {
    message: {
      on: c.message.on,
      min: c.message.min,
      max: c.message.max,
      cooldown: c.message.cooldown,
    },
    voice: {
      on: c.voice.on,
      perMinute: c.voice.perMinute,
      needOthers: c.voice.needOthers,
      skipMuted: c.voice.skipMuted,
    },
    formula: c.formula.trim(),
    maxLevel: c.maxLevel,
    noXpChannels: [...new Set(c.noXpChannels)],
    noXpRoles: [...new Set(c.noXpRoles)],
    boosts: c.boosts.map((b) => ({
      id: b.id,
      kind: b.kind,
      target: b.target,
      multiplier: b.multiplier,
    })),
    levelUp: {
      where: c.levelUp.where,
      channel: c.levelUp.channel,
      template: c.levelUp.template,
      every: c.levelUp.every,
    },
    rewards: c.rewards.map((r) => ({ id: r.id, level: r.level, role: r.role })),
    stackRewards: c.stackRewards,
    removeRewards: c.removeRewards,
    crates: {
      on: c.crates.on,
      channels: [...new Set(c.crates.channels)],
      chance: c.crates.chance,
      cooldown: c.crates.cooldown.trim(),
      min: c.crates.min,
      max: c.crates.max,
      time: c.crates.time,
      template: c.crates.template,
    },
    rank: { template: c.rank.template, public: c.rank.public },
    staff: [...new Set(c.staff)],
    commands: {
      rank: cmd('rank'),
      leaderboard: cmd('leaderboard'),
      xp: cmd('xp'),
    },
  };
}

/** The three curves servers used to pick from, as equations. */
const oldCurves: Record<string, string> = {
  gentle: '3*x^2 + 24*x + 48',
  standard: LV_FORMULA,
  steep: '8*x^2 + 64*x + 78',
};

/** Settings saved by an older version, with anything added since filled in. */
export function lvUpgrade(saved: Partial<Levels> | null | undefined): Levels {
  const base = lvDefault();
  if (!saved) return base;
  // Before the equation, servers picked one of three curves.
  const { curve, ...rest } = saved as Partial<Levels> & { curve?: string };
  return {
    ...base,
    ...rest,
    formula:
      rest.formula ?? (curve ? oldCurves[curve] : undefined) ?? base.formula,
    message: { ...base.message, ...saved.message },
    voice: { ...base.voice, ...saved.voice },
    levelUp: { ...base.levelUp, ...saved.levelUp },
    crates: { ...base.crates, ...saved.crates },
    rank: { ...base.rank, ...saved.rank },
    commands: {
      rank: { ...base.commands.rank, ...saved.commands?.rank },
      leaderboard: {
        ...base.commands.leaderboard,
        ...saved.commands?.leaderboard,
      },
      xp: { ...base.commands.xp, ...saved.commands?.xp },
    },
  };
}

/** Whether someone can change XP. */
export const lvIsStaff = (c: Levels, member: Set<string>, manager: boolean) =>
  manager || c.staff.some((r) => member.has(r));

// Messages --------------------------------------------------------------------

export const lvKindNames: Record<LvKind, string> = {
  levelup: 'Level-up message',
  rank: 'Rank card',
  crate: 'XP crate',
};
export const lvKindAbout: Record<LvKind, string> = {
  levelup: 'Posted when a member reaches a new level.',
  rank: 'What members see when they use /rank.',
  crate: 'Dropped in chat. The first member to press Open gets the XP.',
};

const embedMessage = (
  name: string,
  content: string,
  embed: Partial<ReturnType<typeof embedDefault>>,
): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content,
  embeds: [{ ...embedDefault(), ...embed }],
  components: [],
  v2: v2Default(),
});
const textMessage = (name: string, content: string): StudioMessage => ({
  name,
  channel: '',
  layout: 'embed',
  content,
  embeds: [],
  components: [],
  v2: v2Default(),
});
const v2Message = (
  name: string,
  accent: string,
  text: string,
  thumbnail = '{user.avatar}',
): StudioMessage => ({
  name,
  channel: '',
  layout: 'v2',
  content: '',
  embeds: [],
  components: [],
  v2: { ...v2Default(), accent, text, thumbnail },
});

export type LvPreset = {
  id: string;
  kind: LvKind;
  name: string;
  about: string;
  message: StudioMessage;
};

/** Ready-made messages to start from; the first of each kind is Sparko's own. */
export const lvPresets: LvPreset[] = [
  {
    id: 'lv-up',
    kind: 'levelup',
    name: 'Level-up card',
    about: 'An embed with their new level and progress.',
    message: embedMessage('Level-up card', '', {
      title: '⬆️ Level {level}!',
      description:
        'Nice one, {user}. You reached **level {level}** with **{xp}** XP.\n{progress.bar} {xp.left} XP to level {level}+1',
      thumbnail: '{user.avatar}',
      color: '#FACC15',
      footer: 'Rank {rank} · keep chatting to climb',
    }),
  },
  {
    id: 'lv-up-short',
    kind: 'levelup',
    name: 'One line',
    about: 'A single line, no embed.',
    message: textMessage(
      'Level-up line',
      '⬆️ {user} reached **level {level}**! {reward.role}',
    ),
  },
  {
    id: 'lv-up-v2',
    kind: 'levelup',
    name: 'Modern card',
    about: 'A Components V2 card with their picture.',
    message: v2Message(
      'Modern level-up',
      '#FACC15',
      '### {user.name} reached level {level}\n{progress.bar} **{progress.percent}**\n{separator}\n-# {xp} XP · rank {rank} · {xp.left} XP to the next level',
    ),
  },
  {
    id: 'lv-rank',
    kind: 'rank',
    name: 'Rank card',
    about: 'An embed with their level, XP, place and progress bar.',
    message: embedMessage('Rank card', '', {
      author: '{user.name}',
      authorIcon: '{user.avatar}',
      title: 'Level {level} · Rank {rank}',
      description: '{progress.bar} **{progress.percent}**\n{xp} / {xp.next} XP',
      thumbnail: '{user.avatar}',
      color: '#5865F2',
      fields: [
        { id: 'f1', name: 'Messages', value: '{messages}', inline: true },
        { id: 'f2', name: 'Voice', value: '{voice.time}', inline: true },
        { id: 'f3', name: 'To level up', value: '{xp.left} XP', inline: true },
      ],
    }),
  },
  {
    id: 'lv-rank-v2',
    kind: 'rank',
    name: 'Modern card',
    about: 'A Components V2 card with their picture beside it.',
    message: v2Message(
      'Modern rank card',
      '#5865F2',
      '## {user.name}\n**Level {level}** · Rank {rank}\n{progress.bar} {progress.percent}\n{separator}\n-# {xp} / {xp.next} XP · {messages} messages · {voice.time} in voice',
    ),
  },
  {
    id: 'lv-rank-short',
    kind: 'rank',
    name: 'Compact',
    about: 'Two lines of text, no embed.',
    message: textMessage(
      'Compact rank card',
      '**{user.name}** · level **{level}** · rank **{rank}**\n{progress.bar} {xp} / {xp.next} XP',
    ),
  },
  {
    id: 'lv-crate',
    kind: 'crate',
    name: 'Crate drop',
    about: 'An embed with how much XP it holds and when it vanishes.',
    message: embedMessage('XP crate drop', '', {
      title: '🎁 An XP crate dropped!',
      description:
        'The first to press **Open** gets **{crate.range}**.\nIt vanishes {crate.ends}.',
      color: '#57F287',
    }),
  },
  {
    id: 'lv-crate-v2',
    kind: 'crate',
    name: 'Modern crate',
    about: 'A Components V2 card in green.',
    message: v2Message(
      'Modern XP crate',
      '#57F287',
      '### 🎁 XP crate\nFirst to open it wins **{crate.range}**.\n-# Vanishes {crate.ends}',
      '',
    ),
  },
  {
    id: 'lv-crate-short',
    kind: 'crate',
    name: 'One line',
    about: 'A single line, no embed.',
    message: textMessage(
      'XP crate line',
      '🎁 A crate with **{crate.range}** dropped! Open it before it vanishes {crate.ends}.',
    ),
  },
];

/** Sparko's own message for a kind, used until the server picks one. */
export const lvDefaultMessage = (kind: LvKind) =>
  lvPresets.find((p) => p.kind === kind)!.message;

/** What a level message fills in about the member. */
export type LvFacts = {
  xp: number;
  /** Their place on the leaderboard; 0 when they aren't on it. */
  rank: number;
  messages: number;
  voiceMinutes: number;
  /** The level before a level-up. */
  previous?: number | undefined;
  /** Reward roles this level gave. */
  rewards?: string[] | undefined;
  /** A crate: its range, and when it vanishes. */
  crate?: { min: number; max: number; endsAt: number } | undefined;
};

/** The level variables: {level}, {xp}, {progress.bar}… */
export function lvVariables(c: Levels, f: LvFacts): Record<string, string> {
  const p = lvProgress(c.formula, f.xp, c.maxLevel);
  return {
    level: n(p.level),
    'level.previous': n(f.previous ?? Math.max(0, p.level - 1)),
    xp: n(f.xp),
    'xp.next': n(p.next),
    'xp.left': n(Math.max(0, p.next - f.xp)),
    rank: f.rank ? `#${n(f.rank)}` : 'unranked',
    'progress.bar': lvBar(p.percent),
    'progress.percent': `${p.percent}%`,
    messages: n(f.messages),
    'voice.time': formatDuration(f.voiceMinutes * MINUTE),
    'reward.role': (f.rewards ?? []).map((r) => `<@&${r}>`).join(' '),
    'crate.range': f.crate
      ? f.crate.min === f.crate.max
        ? `${n(f.crate.min)} XP`
        : `${n(f.crate.min)}–${n(f.crate.max)} XP`
      : `${n(c.crates.min)}–${n(c.crates.max)} XP`,
    'crate.ends': f.crate
      ? `<t:${Math.floor(f.crate.endsAt / 1000)}:R>`
      : 'soon',
  };
}

export const LV_CRATE_ID = 'lv:crate';

/** The Open button under a crate, or what it became. */
export function lvCrateRow(
  state: { open: true } | { claimedBy: string; xp: number } | { gone: true },
) {
  const button =
    'open' in state
      ? {
          type: 2,
          style: 3,
          custom_id: LV_CRATE_ID,
          emoji: { name: '🎁' },
          label: 'Open',
        }
      : {
          type: 2,
          style: 2,
          custom_id: LV_CRATE_ID,
          disabled: true,
          emoji: { name: 'gone' in state ? '💨' : '🎉' },
          label:
            'gone' in state
              ? 'Nobody opened it in time'
              : `${state.claimedBy} got ${n(state.xp)} XP`.slice(0, 80),
        };
  return { type: 1, components: [button] };
}

type Payload = Record<string, unknown> & { components?: object[] };

/**
 * A level-up, rank card or crate from a template. Mentions never ping,
 * except the member themselves on a level-up when `ping` is set.
 */
export function lvPayload(
  message: StudioMessage,
  c: Levels,
  facts: LvFacts,
  ctx: { now: number; ping?: string | undefined } & StudioVars,
  crate?: Parameters<typeof lvCrateRow>[0],
) {
  const body = studioPayload(message, {
    ...ctx,
    extra: { ...ctx.extra, ...lvVariables(c, facts) },
  }) as Payload;
  if (crate) body.components = [...(body.components ?? []), lvCrateRow(crate)];
  return {
    ...body,
    allowed_mentions: ctx.ping
      ? { parse: [], users: [ctx.ping] }
      : { parse: [] },
  };
}

// Commands --------------------------------------------------------------------

/** The level commands, as Discord registers them. */
export function lvCommandBodies(c: Levels) {
  const member = (description: string, required = false) => ({
    type: 6,
    name: 'member',
    description,
    required,
  });
  const amount = (description: string, min = 1) => ({
    type: 4,
    name: 'amount',
    description,
    required: true,
    min_value: min,
    max_value: LV_MAX_CHANGE,
  });
  const out: object[] = [];
  const k = c.commands;
  if (k.rank.on)
    out.push({
      type: 1,
      name: k.rank.name,
      description: k.rank.description,
      options: [member('Whose rank card (you if left empty)')],
      contexts: [0],
    });
  if (k.leaderboard.on)
    out.push({
      type: 1,
      name: k.leaderboard.name,
      description: k.leaderboard.description,
      options: [
        {
          type: 4,
          name: 'page',
          description: 'Which page',
          required: false,
          min_value: 1,
          max_value: 1000,
        },
      ],
      contexts: [0],
    });
  if (k.xp.on)
    out.push({
      type: 1,
      name: k.xp.name,
      description: k.xp.description,
      contexts: [0],
      options: [
        {
          type: 1,
          name: 'give',
          description: 'Give a member XP',
          options: [member('Who gets the XP', true), amount('How much XP')],
        },
        {
          type: 1,
          name: 'take',
          description: 'Take XP from a member',
          options: [member('Whose XP', true), amount('How much XP')],
        },
        {
          type: 1,
          name: 'set',
          description: 'Set a member’s XP',
          options: [member('Whose XP', true), amount('Their new XP', 0)],
        },
        {
          type: 1,
          name: 'reset',
          description: 'Reset a member’s XP, or everyone’s',
          options: [
            member('Whose XP to reset'),
            {
              type: 5,
              name: 'everyone',
              description: 'Reset everyone’s XP instead',
              required: false,
            },
          ],
        },
      ],
    });
  return out;
}

/** Which level command a typed command is, in this server. */
export const lvCommandFor = (c: Levels, name: string) =>
  lvCommandKeys.find((k) => c.commands[k].on && c.commands[k].name === name);

// Logs ------------------------------------------------------------------------

export type LvLogAction =
  | 'level-up'
  | 'reward-given'
  | 'reward-removed'
  | 'xp-changed'
  | 'reset'
  | 'crate-dropped'
  | 'crate-opened'
  | 'crate-expired'
  | 'failed';
export type LvLogEntry = {
  id: string;
  action: LvLogAction;
  userId: string;
  userName: string;
  detail: string;
  at: number;
};

/** One log line, like "[LEVEL UP] @kit reached level 5". */
export function lvLogLine(e: LvLogEntry) {
  const who = `@${e.userName}`;
  const more = e.detail ? `: ${e.detail}` : '';
  switch (e.action) {
    case 'level-up':
      return `[LEVEL UP] ${who} ${e.detail}`;
    case 'reward-given':
      return `[REWARD GIVEN] ${who} got a reward role${more}`;
    case 'reward-removed':
      return `[REWARD REMOVED] ${who} lost a reward role${more}`;
    case 'xp-changed':
      return `[XP CHANGED] ${who}’s XP was changed${more}`;
    case 'reset':
      return `[RESET] ${e.userId === '0' ? 'Everyone’s' : `${who}’s`} XP was reset${more}`;
    case 'crate-dropped':
      return `[CRATE DROPPED] ${e.detail}`;
    case 'crate-opened':
      return `[CRATE OPENED] ${who} opened a crate${more}`;
    case 'crate-expired':
      return `[CRATE EXPIRED] ${e.detail}`;
    default:
      return `[FAILED] ${who}${more}`;
  }
}
