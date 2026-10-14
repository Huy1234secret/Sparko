// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Combobox, type ComboItem } from './combobox';

afterEach(cleanup);

const roles: ComboItem[] = [
  { value: '1', label: 'Event pings', color: '#FACC15', color2: '#ED4245' },
  { value: '2', label: 'Moderator', color: '#5865F2' },
];

function Roles() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <Combobox
      multiple
      label="Roles"
      searchPlaceholder="Search roles"
      items={roles}
      value={value}
      onChange={setValue}
    />
  );
}

describe('Combobox', () => {
  it('fills role options and chips with the role colour or gradient', async () => {
    render(<Roles />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Roles' }));
    const pings = screen.getByRole('option', { name: /Event pings/ });
    expect(pings.style.getPropertyValue('--role-fill')).toBe(
      'linear-gradient(90deg, #FACC15, #ED4245)',
    );
    expect(
      screen
        .getByRole('option', { name: /Moderator/ })
        .style.getPropertyValue('--role-fill'),
    ).toBe('#5865F2');

    // Picking one marks it, draws its tick and shows it as a filled chip.
    await userEvent.click(pings);
    expect(pings).toHaveAttribute('aria-selected', 'true');
    expect(pings.querySelector('.sp-combo-option__tick')).not.toBeNull();
    const chip = screen
      .getByRole('button', { name: 'Remove Event pings' })
      .closest('.sp-combo-chip');
    expect(chip).toHaveClass('sp-combo-chip--role');

    // Unpicking keeps the tick a moment to draw it back out.
    await userEvent.click(pings);
    expect(pings).toHaveAttribute('aria-selected', 'false');
    expect(pings.querySelector('.sp-combo-option__tick')).toHaveClass(
      'is-leaving',
    );
  });

  it('shows a single pick as a chip and filters by search', async () => {
    function Channel() {
      const [value, setValue] = useState('a');
      return (
        <Combobox
          label="Channel"
          searchPlaceholder="Search channels"
          items={[
            { value: 'a', label: 'general', icon: 'hash', group: 'Chat' },
            { value: 'b', label: 'rules', icon: 'hash', group: 'Info' },
          ]}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Channel />);
    const trigger = screen.getByRole('button', { name: /Channel/ });
    expect(trigger.querySelector('.sp-combo-chip')).toHaveTextContent(
      'general',
    );
    await userEvent.click(trigger);
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Search channels' }),
      'rul',
    );
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.click(screen.getByRole('option', { name: /rules/ }));
    expect(trigger.querySelector('.sp-combo-chip')).toHaveTextContent('rules');
  });
});
