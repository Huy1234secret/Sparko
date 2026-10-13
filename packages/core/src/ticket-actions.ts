import type { Db } from './db.ts';
import { DiscordCodes, DiscordError, type Rest } from './discord.ts';
import { addAudit, getModule } from './store.ts';
import {
  addTicketMessage,
  autoCloseMs,
  createTicket,
  getPosted,
  nextTicketNumber,
  openTicketOf,
  openTickets,
  setPosted,
  ticketByThread,
  updateTicket,
  type TicketPanel,
  type TicketRow,
} from './tickets.ts';

/** A problem written for the server owner or member, not a crash. */
export class Plain extends Error {}

const buttonStyle = { primary: 1, secondary: 2, success: 3, danger: 4 };
export const ticketButtonPrefix = 'sparko:ticket:';
const PRIVATE_THREAD = 12;
const color = (hex: string) => Number.parseInt(hex.slice(1), 16);

function panelMessage(panel: TicketPanel) {
  return {
    embeds: [
      {
        title: panel.title,
        description: panel.description || undefined,
        color: color(panel.color),
      },
    ],
    components: [
      {
        type: 1,
        components: panel.topics.map((t) => ({
          type: 2,
          style: buttonStyle[t.style],
          label: t.label,
          custom_id: `${ticketButtonPrefix}${t.id}`,
        })),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

const explainDiscord = (error: unknown, where: string) => {
  if (error instanceof DiscordError) {
    if (
      error.code === DiscordCodes.missingPermissions ||
      error.code === DiscordCodes.missingAccess
    )
      return new Plain(
        `Sparko is missing permissions in ${where}. It needs View Channel, Send Messages, Embed Links, Create Private Threads and Send Messages in Threads there.`,
      );
    if (error.code === DiscordCodes.unknownChannel)
      return new Plain(`${where} no longer exists. Pick another channel.`);
  }
  return error;
};

/**
 * Everything Sparko does for tickets in Discord, through the REST API, so
 * the dashboard and the bot share it.
 */
export function ticketActions(
  rest: Rest,
  db: Db,
  now: () => number = Date.now,
) {
  /** Posts the panel, edits it in place, or removes it when Tickets is off. */
  async function applyPanel(guildId: string) {
    const { on, config } = getModule<TicketPanel>(db, guildId, 'tickets');
    const posted = getPosted(db, guildId, 'tickets-panel');
    const remove = async () => {
      if (!posted) return;
      await rest
        .delete(`/channels/${posted.channelId}/messages/${posted.messageId}`)
        .catch(() => {});
      setPosted(db, guildId, 'tickets-panel', null);
    };
    if (!on || !config) return remove();
    const body = panelMessage(config);
    try {
      if (posted?.channelId === config.channel) {
        try {
          await rest.patch(
            `/channels/${posted.channelId}/messages/${posted.messageId}`,
            body,
          );
          return;
        } catch (e) {
          // Someone deleted it: post it again below.
          if (
            !(
              e instanceof DiscordError &&
              e.code === DiscordCodes.unknownMessage
            )
          )
            throw e;
        }
      } else await remove();
      const message = await rest.post<{ id: string }>(
        `/channels/${config.channel}/messages`,
        body,
      );
      setPosted(db, guildId, 'tickets-panel', {
        channelId: config.channel,
        messageId: message.id,
      });
    } catch (e) {
      throw explainDiscord(e, 'the panel’s channel');
    }
  }

  /** A member pressed a panel button: opens their private ticket thread. */
  async function openTicket(o: {
    guildId: string;
    channelId: string;
    topicId: string;
    member: { id: string; name: string };
  }) {
    const { on, config } = getModule<TicketPanel>(db, o.guildId, 'tickets');
    if (!on || !config) throw new Plain('Tickets are closed right now.');
    const topic = config.topics.find((t) => t.id === o.topicId);
    if (!topic)
      throw new Plain(
        'That button is out of date. Ask the staff to check the panel.',
      );
    if (config.onePerMember) {
      const open = openTicketOf(db, o.guildId, o.member.id);
      if (open)
        return { threadId: open.threadId, number: open.number, existing: true };
    }
    let thread: { id: string };
    try {
      thread = await rest.post<{ id: string }>(
        `/channels/${o.channelId}/threads`,
        {
          name: `ticket-${nextTicketNumber(db, o.guildId)}`,
          type: PRIVATE_THREAD,
          invitable: false,
          auto_archive_duration: 10080,
        },
      );
      await rest.put(
        `/channels/${thread.id}/thread-members/${o.member.id}`,
        {},
      );
    } catch (e) {
      throw explainDiscord(e, 'this channel');
    }
    const at = now();
    const number = createTicket(
      db,
      {
        guildId: o.guildId,
        threadId: thread.id,
        memberId: o.member.id,
        memberName: o.member.name,
        category: topic.label,
      },
      at,
    );
    const text = `thanks for opening a ticket. ${topic.question}`.trim();
    const roles = config.ping ? config.roles : [];
    await rest.post(`/channels/${thread.id}/messages`, {
      content: [
        `<@${o.member.id}> ${text}`,
        roles.map((r) => `<@&${r}>`).join(' '),
      ]
        .filter(Boolean)
        .join('\n'),
      embeds: [
        {
          title: `Ticket #${number}`,
          color: color(config.color),
          fields: [
            { name: 'Opened by', value: `<@${o.member.id}>`, inline: true },
            { name: 'Topic', value: topic.label, inline: true },
          ],
        },
      ],
      allowed_mentions: { users: [o.member.id], roles },
    });
    addTicketMessage(
      db,
      {
        guildId: o.guildId,
        number,
        kind: 'opener',
        authorId: null,
        authorName: 'Sparko',
        staff: true,
        text,
      },
      at,
    );
    addAudit(
      db,
      {
        guildId: o.guildId,
        who: o.member.name,
        what: `opened ticket #${number}`,
        detail: topic.label,
        icon: 'ticket',
      },
      at,
    );
    return { threadId: thread.id, number, existing: false };
  }

  /** Someone wrote in a ticket thread in Discord: keep it in the inbox. */
  function recordMessage(m: {
    threadId: string;
    author: { id: string; name: string };
    text: string;
    file?: string | null;
  }) {
    const t = ticketByThread(db, m.threadId);
    if (!t || t.status === 'closed') return undefined;
    const staff = m.author.id !== t.memberId;
    const at = now();
    addTicketMessage(
      db,
      {
        guildId: t.guildId,
        number: t.number,
        kind: 'message',
        authorId: m.author.id,
        authorName: m.author.name,
        staff,
        text: m.text,
        file: m.file ?? null,
      },
      at,
    );
    updateTicket(db, t.guildId, t.number, {
      lastAt: at,
      lastBy: staff ? 'staff' : 'member',
      warnedAt: null,
      ...(staff
        ? {
            status: 'waiting',
            ...(t.assigneeId
              ? {}
              : { assigneeId: m.author.id, assigneeName: m.author.name }),
          }
        : {
            status: t.assigneeId ? 'claimed' : 'new',
            // The member's first words become the ticket's subject.
            ...(t.topic === t.category && m.text.trim()
              ? { topic: m.text.trim().slice(0, 80) }
              : {}),
          }),
    });
    return t.number;
  }

  /** A staff reply from the dashboard, posted in the thread by Sparko. */
  async function reply(
    t: TicketRow,
    by: { id: string; name: string },
    text: string,
  ) {
    if (t.status === 'closed') throw new Plain('This ticket is closed.');
    try {
      await rest.post(`/channels/${t.threadId}/messages`, {
        content: `**${by.name}:** ${text}`.slice(0, 2000),
        allowed_mentions: { parse: [] },
      });
    } catch (e) {
      throw explainDiscord(e, 'this ticket’s thread');
    }
    const at = now();
    addTicketMessage(
      db,
      {
        guildId: t.guildId,
        number: t.number,
        kind: 'message',
        authorId: by.id,
        authorName: by.name,
        staff: true,
        text,
      },
      at,
    );
    updateTicket(db, t.guildId, t.number, {
      status: 'waiting',
      lastAt: at,
      lastBy: 'staff',
      warnedAt: null,
      ...(t.assigneeId ? {} : { assigneeId: by.id, assigneeName: by.name }),
    });
  }

  async function close(
    t: TicketRow,
    by: { id: string | null; name: string },
    reason: string,
    dm = false,
  ) {
    if (t.status === 'closed') return;
    await rest
      .post(`/channels/${t.threadId}/messages`, {
        content: `🔒 Closed by ${by.name}: ${reason}`.slice(0, 2000),
        allowed_mentions: { parse: [] },
      })
      .catch(() => {});
    await rest
      .patch(`/channels/${t.threadId}`, { archived: true, locked: true })
      .catch((e: unknown) => {
        if (
          !(e instanceof DiscordError && e.code === DiscordCodes.unknownChannel)
        )
          throw explainDiscord(e, 'this ticket’s thread');
      });
    updateTicket(db, t.guildId, t.number, {
      status: 'closed',
      closedBy: by.name,
      closeReason: reason,
    });
    addAudit(
      db,
      {
        guildId: t.guildId,
        who: by.name,
        what: `closed ticket #${t.number}`,
        detail: reason,
        icon: 'ticket',
      },
      now(),
    );
    if (dm)
      await rest
        .post<{ id: string }>('/users/@me/channels', {
          recipient_id: t.memberId,
        })
        .then((channel) =>
          rest.post(`/channels/${channel.id}/messages`, {
            content:
              `Your ticket #${t.number} (${t.topic}) was closed: ${reason}`.slice(
                0,
                2000,
              ),
            allowed_mentions: { parse: [] },
          }),
        )
        // People can turn off DMs from servers; that's fine.
        .catch(() => {});
  }

  async function reopen(t: TicketRow, by: { id: string; name: string }) {
    if (t.status !== 'closed') return;
    try {
      await rest.patch(`/channels/${t.threadId}`, {
        archived: false,
        locked: false,
      });
      await rest.post(`/channels/${t.threadId}/messages`, {
        content: `🔓 Reopened by ${by.name}.`,
        allowed_mentions: { parse: [] },
      });
    } catch (e) {
      throw explainDiscord(e, 'this ticket’s thread');
    }
    updateTicket(db, t.guildId, t.number, {
      status: t.assigneeId ? 'claimed' : 'new',
      closedBy: null,
      closeReason: null,
      lastAt: now(),
    });
  }

  /**
   * Closes tickets whose member stopped replying, after warning them two
   * hours before. Run every few minutes.
   */
  async function sweep() {
    for (const t of openTickets(db)) {
      if (t.lastBy !== 'staff') continue;
      const { config } = getModule<TicketPanel>(db, t.guildId, 'tickets');
      const limit = config ? autoCloseMs[config.autoClose] : 0;
      if (!limit) continue;
      const idle = now() - t.lastAt;
      if (idle >= limit)
        await close(
          t,
          { id: null, name: 'Sparko' },
          'No reply from the member',
        ).catch((e: unknown) =>
          console.error(`Auto-closing ticket ${t.number} failed`, e),
        );
      else if (idle >= limit - 2 * 3_600_000 && !t.warnedAt) {
        await rest
          .post(`/channels/${t.threadId}/messages`, {
            content: `<@${t.memberId}> this ticket closes in about 2 hours if there’s no reply.`,
            allowed_mentions: { users: [t.memberId] },
          })
          .catch(() => {});
        updateTicket(db, t.guildId, t.number, { warnedAt: now() });
      }
    }
  }

  return { applyPanel, openTicket, recordMessage, reply, close, reopen, sweep };
}
