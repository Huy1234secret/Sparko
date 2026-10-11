export type InviteUse = { code: string; uses: number; inviterId?: string };
export type InviteSnapshot = {
  invites: InviteUse[];
  observedAt: string;
  canReadInvites: boolean;
  complete: boolean;
  vanityUses: number | null;
};
export type InviteJoin = {
  id: string;
  userId: string;
  joinedAt: string;
  accountCreatedAt: string;
};
export type InviteEvidence = InviteJoin & {
  type: 'invite_join';
  before: InviteUse[];
  after: InviteUse[];
  canReadInvites: boolean;
  simultaneousJoins: number;
  vanityChanged: boolean;
  snapshotComplete: boolean;
};
type PendingJoin = {
  join: InviteJoin;
  resolve: (evidence: InviteEvidence) => void;
};
type GuildState = {
  epoch: number;
  baseline?: InviteSnapshot;
  pending: PendingJoin[];
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/** A single serialized snapshot stream per guild. Reconnects discard the baseline;
 * joins sharing a collection window remain ambiguous even when one invite increased. */
export class InviteCollector {
  private readonly states = new Map<string, GuildState>();
  constructor(
    private readonly fetchSnapshot: (
      guildId: string,
    ) => Promise<InviteSnapshot>,
    private readonly batchMs = 150,
  ) {}
  private state(guildId: string): GuildState {
    let state = this.states.get(guildId);
    if (!state) {
      state = { epoch: 0, pending: [], running: false };
      this.states.set(guildId, state);
    }
    return state;
  }
  invalidate(guildId?: string): void {
    const states = guildId ? [this.state(guildId)] : [...this.states.values()];
    for (const state of states) {
      state.epoch++;
      delete state.baseline;
    }
  }
  private async snapshot(guildId: string): Promise<InviteSnapshot> {
    try {
      return await this.fetchSnapshot(guildId);
    } catch {
      return {
        invites: [],
        observedAt: new Date().toISOString(),
        canReadInvites: false,
        complete: false,
        vanityUses: null,
      };
    }
  }
  async prime(guildId: string): Promise<void> {
    const state = this.state(guildId);
    if (state.running || state.pending.length) return;
    state.running = true;
    const epoch = state.epoch;
    try {
      const snapshot = await this.snapshot(guildId);
      if (epoch === state.epoch) state.baseline = snapshot;
    } finally {
      state.running = false;
      this.schedule(guildId, state);
    }
  }
  join(guildId: string, join: InviteJoin): Promise<InviteEvidence> {
    const state = this.state(guildId);
    return new Promise((resolve) => {
      state.pending.push({ join, resolve });
      this.schedule(guildId, state);
    });
  }
  private schedule(guildId: string, state: GuildState): void {
    if (state.running || state.timer || !state.pending.length) return;
    state.timer = setTimeout(() => {
      delete state.timer;
      void this.drain(guildId, state);
    }, this.batchMs);
  }
  private async drain(guildId: string, state: GuildState): Promise<void> {
    state.running = true;
    const epoch = state.epoch,
      before = state.baseline,
      batch = state.pending.splice(0, 1000);
    const after = await this.snapshot(guildId),
      simultaneousJoins = Math.min(1000, batch.length + state.pending.length);
    const continuous = epoch === state.epoch;
    if (continuous) state.baseline = after;
    for (const pending of batch)
      pending.resolve({
        type: 'invite_join',
        ...pending.join,
        before: before?.invites ?? [],
        after: after.invites,
        canReadInvites: Boolean(before?.canReadInvites && after.canReadInvites),
        simultaneousJoins,
        vanityChanged: before?.vanityUses !== after.vanityUses,
        snapshotComplete: Boolean(
          continuous &&
          before?.complete &&
          after.complete &&
          Date.parse(pending.join.joinedAt) >= Date.parse(before.observedAt),
        ),
      });
    state.running = false;
    this.schedule(guildId, state);
  }
}
