/**
 * Automatic roles: roles Sparko gives on its own when someone joins, once
 * they've accepted the rules, after they've been in the server a while, or
 * once they meet a rule (account age, a Discord badge, boosting). Nothing
 * here touches the database or the network, so the dashboard imports this
 * file too.
 */

export const AR_MODULE = 'autoroles';

/** A length of time written like "30m", "12h", "7d" or "1d 12h". */
export type Duration = string;

export type ARTimed = {
  id: string;
  /** How long a member has to have been in the server. */
  after: Duration;
  role: string;
};

export type ARCondition =
  | { id: string; kind: 'age'; min: Duration }
  | { id: string; kind: 'badge'; badges: string[] }
  | { id: string; kind: 'booster'; boosts: number; for: Duration };
export type ARConditionKind = ARCondition['kind'];
export type ARLink = 'and' | 'or';

export type ARRule = {
  id: string;
  name: string;
  conditions: ARCondition[];
  /** How each condition joins the one before it: links[i] sits between i and i+1. */
  links: ARLink[];
  role: string;
  /** Forgets what Sparko counted for this rule (boosts) when they leave. */
  resetOnLeave: boolean;
  /** Takes the role away again when the member stops meeting the rule. */
  removeOnLoss: boolean;
};

export type AutoRoles = {
  join: {
    /** Given on joining; swapped for `after` once they accept the rules. */
    before: string[];
    /** Given once they've accepted the rules (or straight away without screening). */
    after: string[];
  };
  timed: ARTimed[];
  /** Time in the server starts again from zero when someone leaves. */
  restartOnLeave: boolean;
  /** Keeps earlier timed roles; off swaps each one for the next. */
  stack: boolean;
  rules: ARRule[];
};

export const arDefault = (): AutoRoles => ({
  join: { before: [], after: [] },
  timed: [],
  restartOnLeave: true,
  stack: true,
  rules: [],
});

/** How many timed roles and rules each plan has. */
export const arLimits = (plan?: string | null) =>
  plan === 'plus'
    ? { timed: 10, rules: 25, conditions: 10, joinRoles: 10 }
    : { timed: 3, rules: 10, conditions: 10, joinRoles: 5 };

// Durations -------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const units: Record<string, number> = {
  m: MINUTE,
  h: HOUR,
  d: DAY,
  w: 7 * DAY,
  y: 365 * DAY,
};

/** "1d 12h" → milliseconds, or null when it can't be read. */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  let total = 0;
  let rest = s;
  const part = /^(\d{1,5})\s*([mhdwy])\s*/;
  while (rest) {
    const m = part.exec(rest);
    if (!m) return null;
    total += Number(m[1]) * units[m[2]!]!;
    rest = rest.slice(m[0].length).replace(/^,\s*/, '');
  }
  return total;
}

/** Milliseconds → "1d 12h", using the two largest units. */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return '0m';
  const parts: string[] = [];
  let left = ms;
  for (const [u, size] of [
    ['y', units.y!],
    ['d', DAY],
    ['h', HOUR],
    ['m', MINUTE],
  ] as const) {
    const n = Math.floor(left / size);
    if (n) {
      parts.push(`${n}${u}`);
      left -= n * size;
    }
    if (parts.length === 2) break;
  }
  return parts.join(' ');
}

/** The shortest and longest each kind of time can be. */
export const arRanges = {
  timed: { min: MINUTE, max: 730 * DAY, label: '1m and 2y' },
  age: { min: DAY, max: 730 * DAY, label: '1d and 2y' },
  boost: { min: DAY, max: 365 * DAY, label: '1d and 365d' },
} as const;

// Badges ----------------------------------------------------------------------

/** Badges a bot can see on someone's profile, by their public flag. */
export const arBadges = [
  { id: 'staff', label: 'Discord Staff', flag: 1 << 0 },
  { id: 'partner', label: 'Partnered Server Owner', flag: 1 << 1 },
  { id: 'hypesquad', label: 'HypeSquad Events', flag: 1 << 2 },
  { id: 'bug1', label: 'Bug Hunter', flag: 1 << 3 },
  { id: 'bravery', label: 'HypeSquad Bravery', flag: 1 << 6 },
  { id: 'brilliance', label: 'HypeSquad Brilliance', flag: 1 << 7 },
  { id: 'balance', label: 'HypeSquad Balance', flag: 1 << 8 },
  { id: 'early', label: 'Early Supporter', flag: 1 << 9 },
  { id: 'bug2', label: 'Gold Bug Hunter', flag: 1 << 14 },
  { id: 'botdev', label: 'Early Verified Bot Developer', flag: 1 << 17 },
  { id: 'mod', label: 'Moderator Programs Alumni', flag: 1 << 18 },
  { id: 'activedev', label: 'Active Developer', flag: 1 << 22 },
] as const;
const badgeIds = new Set<string>(arBadges.map((b) => b.id));

export const arConditionNames: Record<ARConditionKind, string> = {
  age: 'Account age',
  badge: 'Discord badge',
  booster: 'Booster',
};

// Checks ----------------------------------------------------------------------

export type ARIssue = { at: string; problem: string };

const snowflake = /^\d{1,25}$/;
const itemId = /^[\w-]{1,40}$/;

/**
 * Checks settings sent by the dashboard. `roles` maps a role's id to whether
 * Sparko can give it. Returns the first problem, and where it is.
 */
export function arIssue(
  input: unknown,
  {
    roles,
    plan,
  }: { roles?: Map<string, boolean>; plan?: string | null | undefined } = {},
): ARIssue | null {
  const x = input as Partial<AutoRoles> | null;
  const missing = { at: '', problem: 'Some settings are missing.' };
  if (!x || typeof x !== 'object') return missing;
  const limits = arLimits(plan);
  const roleProblem = (id: unknown, what: string) => {
    if (typeof id !== 'string' || !snowflake.test(id))
      return `Pick a role for ${what}.`;
    if (roles && !roles.has(id))
      return `The role for ${what} was deleted. Pick another one.`;
    if (roles && roles.get(id) === false)
      return `Sparko can’t give the role for ${what}. Move Sparko’s role above it, or pick another one.`;
    return null;
  };

  const j = x.join;
  if (!j || !Array.isArray(j.before) || !Array.isArray(j.after)) return missing;
  for (const [list, what] of [
    [j.before, 'members who haven’t accepted the rules'],
    [j.after, 'members who have accepted the rules'],
  ] as const) {
    if (list.length > limits.joinRoles)
      return {
        at: 'join',
        problem: `Join roles can give up to ${limits.joinRoles} roles each.`,
      };
    for (const id of list) {
      const p = roleProblem(id, what);
      if (p) return { at: 'join', problem: p };
    }
  }

  if (
    !Array.isArray(x.timed) ||
    typeof x.restartOnLeave !== 'boolean' ||
    typeof x.stack !== 'boolean'
  )
    return missing;
  if (x.timed.length > limits.timed)
    return {
      at: 'timed',
      problem: `This plan has up to ${limits.timed} timed roles.`,
    };
  const seen = new Set<number>();
  for (const [i, t] of x.timed.entries()) {
    if (!t || typeof t.id !== 'string' || !itemId.test(t.id)) return missing;
    const where = `timed:${t.id}`;
    const what = `timed role ${i + 1}`;
    const ms = typeof t.after === 'string' ? parseDuration(t.after) : null;
    if (ms === null)
      return {
        at: where,
        problem: `Write how long for ${what}, like 30m, 12h or 7d.`,
      };
    if (ms < arRanges.timed.min || ms > arRanges.timed.max)
      return {
        at: where,
        problem: `The time for ${what} has to be between ${arRanges.timed.label}.`,
      };
    if (seen.has(ms))
      return { at: where, problem: `Two timed roles use the same time.` };
    seen.add(ms);
    const p = roleProblem(t.role, what);
    if (p) return { at: where, problem: p };
  }

  if (!Array.isArray(x.rules)) return missing;
  if (x.rules.length > limits.rules)
    return {
      at: 'rules',
      problem: `This plan has up to ${limits.rules} rules.`,
    };
  for (const [i, r] of x.rules.entries()) {
    if (!r || typeof r.id !== 'string' || !itemId.test(r.id)) return missing;
    const where = `rule:${r.id}`;
    const what = r.name?.trim() ? `“${r.name.trim()}”` : `rule ${i + 1}`;
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 60)
      return {
        at: where,
        problem: `Give rule ${i + 1} a name of up to 60 characters.`,
      };
    if (!Array.isArray(r.conditions) || !r.conditions.length)
      return { at: where, problem: `Add at least one requirement to ${what}.` };
    if (r.conditions.length > limits.conditions)
      return {
        at: where,
        problem: `A rule has up to ${limits.conditions} requirements.`,
      };
    if (
      !Array.isArray(r.links) ||
      r.links.length !== r.conditions.length - 1 ||
      r.links.some((l) => l !== 'and' && l !== 'or')
    )
      return missing;
    for (const c of r.conditions) {
      if (!c || typeof c.id !== 'string' || !itemId.test(c.id)) return missing;
      const spot = `cond:${c.id}`;
      if (c.kind === 'age') {
        const ms = typeof c.min === 'string' ? parseDuration(c.min) : null;
        if (ms === null || ms < arRanges.age.min || ms > arRanges.age.max)
          return {
            at: spot,
            problem: `The account age in ${what} has to be between ${arRanges.age.label}.`,
          };
      } else if (c.kind === 'badge') {
        if (
          !Array.isArray(c.badges) ||
          !c.badges.length ||
          c.badges.some((b) => !badgeIds.has(b))
        )
          return { at: spot, problem: `Pick at least one badge in ${what}.` };
      } else if (c.kind === 'booster') {
        if (!Number.isInteger(c.boosts) || c.boosts < 1 || c.boosts > 100)
          return {
            at: spot,
            problem: `The boosts in ${what} have to be between 1 and 100.`,
          };
        const ms = typeof c.for === 'string' ? parseDuration(c.for) : null;
        if (ms === null || ms < arRanges.boost.min || ms > arRanges.boost.max)
          return {
            at: spot,
            problem: `How long they’ve boosted in ${what} has to be between ${arRanges.boost.label}.`,
          };
      } else return missing;
    }
    const p = roleProblem(r.role, what);
    if (p) return { at: where, problem: p };
    if (
      typeof r.resetOnLeave !== 'boolean' ||
      typeof r.removeOnLoss !== 'boolean'
    )
      return missing;
  }
  return null;
}

/** Keeps only the known fields, so nothing else is stored. */
export function cleanAR(c: AutoRoles): AutoRoles {
  const cond = (k: ARCondition): ARCondition =>
    k.kind === 'age'
      ? { id: k.id, kind: 'age', min: k.min.trim() }
      : k.kind === 'badge'
        ? { id: k.id, kind: 'badge', badges: [...new Set(k.badges)] }
        : { id: k.id, kind: 'booster', boosts: k.boosts, for: k.for.trim() };
  return {
    join: {
      before: [...new Set(c.join.before)],
      after: [...new Set(c.join.after)],
    },
    timed: c.timed.map((t) => ({
      id: t.id,
      after: t.after.trim(),
      role: t.role,
    })),
    restartOnLeave: c.restartOnLeave,
    stack: c.stack,
    rules: c.rules.map((r) => ({
      id: r.id,
      name: r.name.trim(),
      conditions: r.conditions.map(cond),
      links: [...r.links],
      role: r.role,
      resetOnLeave: r.resetOnLeave,
      removeOnLoss: r.removeOnLoss,
    })),
  };
}

// Deciding --------------------------------------------------------------------

/** What Sparko knows about a member when checking a rule. */
export type ARFacts = {
  /** When their Discord account was made. */
  created: number;
  /** Their public badge flags. */
  flags: number;
  /** Boosts Sparko has counted for them. */
  boosts: number;
  /** Since when they've been boosting, or null. */
  boostingSince: number | null;
};

/** When an account was made, read from its id. */
export const createdAt = (userId: string) =>
  Number(BigInt(userId) >> 22n) + 1420070400000;

export function conditionMet(c: ARCondition, f: ARFacts, now: number) {
  if (c.kind === 'age') return now - f.created >= (parseDuration(c.min) ?? 0);
  if (c.kind === 'badge')
    return arBadges.some((b) => c.badges.includes(b.id) && f.flags & b.flag);
  return (
    f.boostingSince !== null &&
    Math.max(f.boosts, 1) >= c.boosts &&
    now - f.boostingSince >= (parseDuration(c.for) ?? 0)
  );
}

/** AND binds before OR, as in "A and B or C" = "(A and B) or C". */
export function ruleMet(r: ARRule, f: ARFacts, now: number) {
  if (!r.conditions.length) return false;
  let any = false;
  let all = true;
  r.conditions.forEach((c, i) => {
    if (i > 0 && r.links[i - 1] === 'or') {
      any ||= all;
      all = true;
    }
    all &&= conditionMet(c, f, now);
  });
  return any || all;
}

/**
 * The timed roles a member should have after `served` ms in the server.
 * Without stacking, only the latest one they've reached.
 */
export function timedRoles(c: AutoRoles, served: number) {
  const due = c.timed
    .map((t) => ({ role: t.role, ms: parseDuration(t.after) ?? Infinity }))
    .filter((t) => t.ms <= served)
    .sort((a, b) => a.ms - b.ms);
  return c.stack ? due.map((t) => t.role) : due.slice(-1).map((t) => t.role);
}

/** Every role this module hands out, so it only ever takes back its own. */
export function arRoles(c: AutoRoles) {
  return new Set([
    ...c.timed.map((t) => t.role),
    ...c.rules.map((r) => r.role),
  ]);
}

// Logs ------------------------------------------------------------------------

export type ARAction =
  | 'met'
  | 'lost'
  | 'added'
  | 'saved'
  | 'removed'
  | 'failed';
export type ARLogEntry = {
  id: string;
  action: ARAction;
  userId: string;
  userName: string;
  roleId: string;
  /** The timed role or rule it was for, or '' for join roles and data. */
  trigger: string;
  reason: string;
  at: number;
};

/** One log line, with ids written as Discord mentions where they fit. */
export function arLogText(e: ARLogEntry) {
  const who = `<@${e.userId}>`;
  const role = `<@&${e.roleId}>`;
  switch (e.action) {
    case 'met':
      return `[MET] ${who} met the ${e.trigger} requirement and received ${role}.`;
    case 'lost':
      return `[LOST] ${who} lost ${role}: they no longer meet the ${e.trigger} requirement.`;
    case 'added':
      return `[ADDED] ${who} received ${role} on joining the server.`;
    case 'saved':
      return `[DATA SAVED] ${who}’s role data was saved.`;
    case 'removed':
      return `[DATA REMOVED] ${who}’s role data was wiped.`;
    case 'failed':
      return `[FAILED] Couldn’t give ${who} ${role}: ${e.reason}`;
  }
}

// Members' saved data ---------------------------------------------------------

/** What Sparko keeps about one member for this module. */
export type ARMember = {
  userId: string;
  name: string;
  /** When they joined this time, or null while they're not in the server. */
  joinedAt: number | null;
  /** Time in the server before `joinedAt`. */
  servedMs: number;
  boosts: number;
  boostingSince: number | null;
  flags: number;
  /** Roles this module gave them that they still have. */
  given: string[];
  /** Roles Sparko couldn't give, so it doesn't try every minute. */
  blocked: string[];
  updatedAt: number;
};

/** How long they've been in the server, counting earlier stays. */
export const servedOf = (m: ARMember, now: number) =>
  m.servedMs + (m.joinedAt === null ? 0 : Math.max(0, now - m.joinedAt));
