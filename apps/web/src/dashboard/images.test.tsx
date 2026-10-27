// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ToastProvider } from '../ui';
import { routes } from '../router';
import { api, createQueryClient } from '../data';
import { resetMock, setMockDelay } from '../data/mock';

const serverId = '900000000000000001';
const studio = `/dashboard/${serverId}/studio`;

beforeAll(async () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  window.scrollTo = vi.fn(() => Promise.resolve()) as never;
  Element.prototype.scrollTo = vi.fn(() => Promise.resolve()) as never;
  await import('../../../../design-system/assets/icons/sp-icon.js');
});
beforeEach(() => {
  resetMock();
  setMockDelay(0);
});
afterEach(cleanup);

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('Image studio', { timeout: 20_000 }, () => {
  it('is a fourth tab in Message Studio, with the saved images', async () => {
    const router = open(studio);
    await userEvent.click(
      await screen.findByRole(
        'tab',
        { name: /Image studio/ },
        { timeout: 5000 },
      ),
    );
    expect(router.state.location.search).toBe('?tab=images');
    const list = await screen.findByRole(
      'list',
      { name: 'Images' },
      { timeout: 5000 },
    );
    expect(within(list).getByText('Server banner')).toBeInTheDocument();
    expect(within(list).getByText('Welcome card')).toBeInTheDocument();
    expect(screen.getByText('You have 2/25 images.')).toBeInTheDocument();
    // Search narrows the list.
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search images' }),
      'ban',
    );
    expect(within(list).queryByText('Welcome card')).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search images' }),
      'zzz',
    );
    expect(screen.getByText('No images match “banzzz”.')).toBeInTheDocument();
  });

  it('offers sizes and an uploaded picture to start a new image', async () => {
    open(`${studio}?tab=images`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /New image/ },
        { timeout: 5000 },
      ),
    );
    const dialog = screen.getByRole('dialog', { name: 'New image' });
    for (const size of [
      'Embed image',
      'Welcome card',
      'Server banner',
      'Server icon or emoji',
      'Square post',
      'Edit a picture',
    ])
      expect(within(dialog).getByText(size)).toBeInTheDocument();
    const width = within(dialog).getByRole('spinbutton', { name: 'Width' });
    await userEvent.clear(width);
    await userEvent.type(width, '5000');
    expect(
      within(dialog).getByRole('button', { name: 'Custom size' }),
    ).toBeDisabled();
    expect(within(dialog).getAllByText('16 to 2048')).toHaveLength(1);
  });

  it('duplicates and deletes images', async () => {
    open(`${studio}?tab=images`);
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Duplicate Server banner' },
        { timeout: 5000 },
      ),
    );
    expect(await screen.findByText('Server banner (copy)')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Welcome card' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Delete “Welcome card”?',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Welcome card')).not.toBeInTheDocument(),
    );
    const { images } = await api.getImages(serverId);
    expect(images.map((i) => i.name)).toEqual([
      'Server banner (copy)',
      'Server banner',
    ]);
  });

  it('checks designs and keeps names unique in the sample data', async () => {
    const { images } = await api.getImages(serverId);
    await expect(
      api.saveImage(serverId, {
        name: 'Big',
        design: { ...images[0]!.design, width: 9000 },
        url: 'blob:x',
      }),
    ).rejects.toThrow('16 to 2048');
    const { id } = await api.saveImage(serverId, {
      name: 'Server banner',
      design: images[0]!.design,
      url: 'blob:x',
    });
    await expect(
      api.updateImage(serverId, id, { name: 'Welcome card' }),
    ).rejects.toThrow('already exists');
    expect((await api.getImages(serverId)).images[0]).toMatchObject({
      id,
      name: 'Server banner (x2)',
    });
  });
});
