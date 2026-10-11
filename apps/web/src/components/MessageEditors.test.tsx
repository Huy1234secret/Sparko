// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageBlock, MessageDocument } from '@sparko/messages';
import { ControlEditor, type ControlEditorResources } from './ControlEditor';
import { EmbedEditor } from './EmbedEditor';

type Row = Extract<MessageBlock, { type: 'controls' }>;
type EmbedDocument = Extract<MessageDocument, { mode: 'embed' }>;
const resources: ControlEditorResources = {
  channels: [],
  roles: [],
  emojis: [
    {
      id: '123456789012345678',
      name: 'support_spark',
      animated: true,
      available: true,
    },
  ],
};
const buttonRow: Row = {
  type: 'controls',
  controls: [
    {
      type: 'button',
      key: 'support',
      label: 'Support',
      style: 'secondary',
      emoji: { name: '🎫' },
      action: { type: 'response.private', text: 'How can we help?' },
    },
  ],
};
function renderControl(row: Row) {
  const changed = vi.fn<(next: Row) => void>();
  function Harness() {
    const [current, setCurrent] = useState(row);
    return (
      <ControlEditor
        row={current}
        resources={resources}
        onChange={(next) => {
          changed(next);
          setCurrent(next);
        }}
      />
    );
  }
  render(<Harness />);
  return changed;
}
afterEach(cleanup);
describe('message control emoji editing', () => {
  it('requires a real custom emoji ID and Unicode fallback before replacing the saved emoji', async () => {
    const user = userEvent.setup();
    const changed = renderControl(buttonRow);
    await user.selectOptions(
      screen.getByLabelText('Button 1 emoji type'),
      'custom',
    );
    expect(screen.getByLabelText('Button 1 custom emoji ID')).toHaveValue('');
    await user.selectOptions(
      screen.getByLabelText('Button 1 server emoji'),
      '123456789012345678',
    );
    expect(screen.getByLabelText('Button 1 custom emoji name')).toHaveValue(
      'support_spark',
    );
    expect(
      screen.getByLabelText('Button 1 custom emoji is animated'),
    ).toBeChecked();
    await user.click(
      screen.getByRole('button', { name: 'Apply button 1 emoji' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a Unicode fallback',
    );
    expect(changed).not.toHaveBeenCalled();
    await user.type(
      screen.getByLabelText('Button 1 Unicode fallback'),
      'ticket',
    );
    await user.click(
      screen.getByRole('button', { name: 'Apply button 1 emoji' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'must be a Unicode emoji',
    );
    expect(changed).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Button 1 Unicode fallback'));
    await user.type(screen.getByLabelText('Button 1 Unicode fallback'), '🎫');
    await user.click(
      screen.getByRole('button', { name: 'Apply button 1 emoji' }),
    );
    expect(changed.mock.lastCall?.[0].controls[0]).toMatchObject({
      emoji: {
        id: '123456789012345678',
        name: 'support_spark',
        animated: true,
        fallback: '🎫',
      },
    });
    await user.selectOptions(screen.getByLabelText('Button style'), 'link');
    expect(changed.mock.lastCall?.[0].controls[0]).toMatchObject({
      style: 'link',
      emoji: { id: '123456789012345678', fallback: '🎫' },
    });
  });

  it('keeps an unapplied emoji draft when another control field changes', async () => {
    const user = userEvent.setup();
    const changed = renderControl(buttonRow);
    const emoji = screen.getByLabelText('Button 1 Unicode emoji');
    await user.clear(emoji);
    await user.type(emoji, 'pending');
    await user.type(screen.getByLabelText('Button label'), ' desk');
    expect(emoji).toHaveValue('pending');
    expect(changed.mock.lastCall?.[0].controls[0]).toMatchObject({
      label: 'Support desk',
      emoji: { name: '🎫' },
    });
    await user.click(
      screen.getByRole('button', { name: 'Apply button 1 emoji' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Unicode emoji');
    expect(emoji).toHaveValue('pending');
  });

  it('applies and removes an emoji on a select option without changing its action or choice', async () => {
    const user = userEvent.setup();
    const changed = renderControl({
      type: 'controls',
      controls: [
        {
          type: 'select',
          key: 'choices',
          minValues: 1,
          maxValues: 1,
          action: { type: 'response.private', text: 'Choice received.' },
          options: [{ label: 'Help', value: 'help' }],
        },
      ],
    });
    await user.selectOptions(
      screen.getByLabelText('Option 1 emoji type'),
      'unicode',
    );
    await user.type(screen.getByLabelText('Option 1 Unicode emoji'), '🎫');
    await user.click(
      screen.getByRole('button', { name: 'Apply option 1 emoji' }),
    );
    expect(changed.mock.lastCall?.[0].controls[0]).toMatchObject({
      action: { type: 'response.private', text: 'Choice received.' },
      options: [{ label: 'Help', value: 'help', emoji: { name: '🎫' } }],
    });
    await user.selectOptions(
      screen.getByLabelText('Option 1 emoji type'),
      'none',
    );
    await user.click(
      screen.getByRole('button', { name: 'Apply option 1 emoji' }),
    );
    expect(changed.mock.lastCall?.[0].controls[0]).toMatchObject({
      options: [{ label: 'Help', value: 'help' }],
    });
    const select = changed.mock.lastCall?.[0].controls[0];
    if (select?.type !== 'select') throw new Error('Expected a select menu');
    expect(select.options[0]).not.toHaveProperty('emoji');
  });
});

describe('embed link and timestamp editing', () => {
  it('retains optional link drafts and applies UTC time explicitly across unrelated edits', async () => {
    const user = userEvent.setup();
    const changed = vi.fn<(next: EmbedDocument) => void>();
    function Harness() {
      const [document, setDocument] = useState<EmbedDocument>({
        schemaVersion: 1,
        name: 'Support message',
        visibility: 'public',
        tokenContext: 'generic',
        allowedTokens: [],
        mode: 'embed',
        embeds: [{ title: 'Support', color: 16436245 }],
        blocks: [],
      });
      return (
        <EmbedEditor
          document={document}
          resources={resources}
          onChange={(next) => {
            changed(next);
            setDocument(next);
          }}
        />
      );
    }
    render(<Harness />);
    const link = screen.getByLabelText('Title link URL');
    await user.type(link, 'https://example.com/support');
    expect(changed.mock.lastCall?.[0].embeds[0]?.url).toBe(
      'https://example.com/support',
    );
    const timestamp = screen.getByLabelText('Timestamp (UTC)');
    const changesBeforeTime = changed.mock.calls.length;
    fireEvent.change(timestamp, { target: { value: '2026-10-11T14:30' } });
    expect(changed).toHaveBeenCalledTimes(changesBeforeTime);
    await user.type(screen.getByLabelText('Embed title'), ' desk');
    expect(timestamp).toHaveValue('2026-10-11T14:30');
    expect(changed.mock.lastCall?.[0].embeds[0]).not.toHaveProperty(
      'timestamp',
    );
    await user.click(screen.getByRole('button', { name: 'Apply timestamp' }));
    expect(changed.mock.lastCall?.[0].embeds[0]?.timestamp).toBe(
      '2026-10-11T14:30:00.000Z',
    );
    fireEvent.change(timestamp, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Apply timestamp' }));
    expect(changed.mock.lastCall?.[0].embeds[0]).not.toHaveProperty(
      'timestamp',
    );
    await user.clear(link);
    expect(changed.mock.lastCall?.[0].embeds[0]).not.toHaveProperty('url');
  });
});
