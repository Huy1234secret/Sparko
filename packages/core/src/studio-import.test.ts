import { describe, expect, it } from 'vitest';
import { studioDefault } from './index.ts';
import {
  studioPayload,
  studioIssue,
  type StudioMessage,
} from './studio-format.ts';
import { fromDiscord, jsonErrorLine } from './studio-import.ts';

const button: StudioMessage['components'][number] = {
  id: 'b1',
  type: 'button',
  label: 'Join',
  emoji: '🎉',
  colour: 'green',
  link: false,
  url: '',
  actions: [{ id: 'a1', type: 'role', mode: 'give', roles: ['900'] }],
};
const base: StudioMessage = {
  ...studioDefault('100'),
  components: [button],
};
const raw = (m: StudioMessage) =>
  JSON.parse(JSON.stringify(studioPayload(m, { now: 0, raw: true })));

describe('reading Discord JSON back into Studio', () => {
  it('round-trips a classic message, keeping what buttons do', () => {
    const m: StudioMessage = {
      ...base,
      content: 'Hi {user}',
      embeds: [
        {
          ...base.embeds[0]!,
          title: 'Party',
          color: '#5865F2',
          fields: [{ id: 'f1', name: 'When', value: 'Now', inline: true }],
        },
      ],
    };
    const back = fromDiscord(raw(m), m);
    expect('message' in back && back.message.content).toBe('Hi {user}');
    if (!('message' in back)) return;
    expect(back.message.embeds[0]).toMatchObject({
      title: 'Party',
      color: '#5865F2',
      fields: [{ name: 'When', value: 'Now', inline: true }],
    });
    // The button keeps its actions, found by its custom id.
    expect(back.message.components).toEqual([button]);
    expect(raw(back.message)).toEqual(raw(m));
  });

  it('round-trips a Components V2 message with things placed around it', () => {
    const m: StudioMessage = {
      ...base,
      layout: 'v2',
      v2: {
        accent: '#ED4245',
        text: '## Hello\n{separator}\nMore\nLast',
        thumbnail: 'https://img.example/t.png',
        gallery: [
          { id: 'g', url: 'https://img.example/1.png', description: '' },
        ],
        place: [
          { id: 'b1', slot: { at: 'beside', line: 2 } },
          { id: 'gallery', slot: { at: 'below' } },
        ],
      },
    };
    const back = fromDiscord(raw(m), m);
    if (!('message' in back)) throw new Error(back.problem);
    expect(back.message.layout).toBe('v2');
    expect(back.message.v2).toMatchObject({
      accent: '#ED4245',
      text: '## Hello\n{separator}\nMore\nLast',
      thumbnail: 'https://img.example/t.png',
      place: [
        { id: 'b1', slot: { at: 'beside', line: 2 } },
        { id: 'gallery', slot: { at: 'below' } },
      ],
    });
    expect(raw(back.message)).toEqual(raw(m));
  });

  it('refuses what Studio can’t show, saying why', () => {
    expect(fromDiscord([], base)).toEqual({
      problem: 'The JSON must be one message object, in { }.',
    });
    expect(
      fromDiscord(
        { components: [{ type: 1, components: [{ type: 5 }] }] },
        base,
      ),
    ).toMatchObject({ problem: expect.stringMatching(/text menus/) });
  });

  it('finds the line a JSON error is on', () => {
    const source = '{\n  "content": "hi",\n  oops\n}';
    let error: unknown;
    try {
      JSON.parse(source);
    } catch (e) {
      error = e;
    }
    // Node says where the error is, either as a line or a position.
    expect(jsonErrorLine(source, error)).toBe(3);
  });

  it('says where a problem is', () => {
    const m: StudioMessage = {
      ...base,
      components: [{ ...button, actions: [] }],
    };
    expect(studioIssue(m)).toEqual({
      problem: 'Give every action button something to do, or make it a link.',
      at: 'component:b1/actions',
    });
    expect(studioIssue({ ...base, channel: '' })?.at).toBe('channel');
  });
});
