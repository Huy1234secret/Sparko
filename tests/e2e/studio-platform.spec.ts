import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';

const guild = '123456789012345678';
async function openStudio(page: Page) {
  await page.route(/\/api\/v1\/auth\/discord\?/, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const destination = new URL(response.headers()['location'] ?? '');
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        location: `http://localhost:5173/api/v1/auth/discord/callback?code=controlled-test-code&state=${encodeURIComponent(destination.searchParams.get('state') ?? '')}`,
      },
      body: '',
    });
  });
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Continue with Discord' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your servers', level: 1 }),
  ).toBeVisible({ timeout: 15000 });
  await page.goto(`/dashboard/${guild}/messages/studio`);
  await expect(
    page.getByRole('heading', { name: 'Message Studio', level: 1 }),
  ).toBeVisible();
}
async function state(request: APIRequestContext) {
  return (await request.get('http://localhost:3001/__test/state')).json();
}
async function privateControl(page: Page) {
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page
    .getByLabel('When a member uses this control')
    .selectOption('response.private');
  await page.getByLabel('Response text').fill('A private community response.');
  await page.getByRole('button', { name: 'Apply control action' }).click();
}
test.afterEach(async ({ request }) => {
  await request.post('http://localhost:3001/__test/discord/writes', {
    data: { fail: false },
  });
});

test('visual Studio edits nested blocks, section accessories, gallery items and UTC embeds', async ({
  page,
  request,
}) => {
  await openStudio(page);
  await page.getByLabel('Design name').fill('M2 visual design');
  await page.getByLabel('Add new blocks to').selectOption('container');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByLabel('Text', { exact: true }).fill('Nested editor content');
  await page.getByRole('button', { name: 'Section', exact: true }).click();
  await page.getByLabel('Section text').fill('Section accessory details');
  await page.getByLabel('Section accessory').selectOption('thumbnail');
  await page
    .getByLabel('Thumbnail alternative text')
    .fill('Community thumbnail');
  await page.getByLabel('Hide thumbnail until revealed').check();
  await page.getByLabel('Section accessory').selectOption('button');
  await page.getByLabel('Button label').fill('Private help');
  await page.getByLabel('Response text').fill('Private section help response.');
  await page.getByRole('button', { name: 'Apply control action' }).click();
  await page
    .getByRole('button', { name: 'Media gallery', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add gallery image' }).click();
  await expect(page.getByLabel('Media URL')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove gallery image 2' }).click();
  await expect(page.getByLabel('Media URL')).toHaveCount(1);
  await page.getByLabel('Hide image until revealed').check();
  await page
    .getByLabel('Version name (optional)')
    .fill('Visual editor acceptance');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Draft saved. No message has been posted.'),
  ).toBeVisible();
  const saved = (await state(request)).templates.find(
    (template: { name: string }) => template.name === 'M2 visual design',
  );
  expect(saved.versions[0].label).toBe('Visual editor acceptance');
  const container = saved.versions[0].document.blocks[0];
  expect(
    container.children.some(
      (block: { text?: string }) => block.text === 'Nested editor content',
    ),
  ).toBeTruthy();
  expect(
    container.children.find(
      (block: { type: string }) => block.type === 'section',
    ).accessory.action.text,
  ).toBe('Private section help response.');
  expect(
    container.children.find(
      (block: { type: string }) => block.type === 'gallery',
    ).items,
  ).toHaveLength(1);
  expect(
    container.children.find(
      (block: { type: string }) => block.type === 'gallery',
    ).items[0].spoiler,
  ).toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath('studio-visual-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBeTruthy();
  await page.screenshot({
    path: test.info().outputPath('studio-visual-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .getByRole('button', { name: 'Traditional embed', exact: true })
    .click();
  await page.getByRole('button', { name: 'Convert draft' }).click();
  await page
    .getByLabel('Title link URL')
    .first()
    .fill('https://example.com/community');
  await page.getByLabel('Timestamp (UTC)').first().fill('2026-11-01T13:15');
  await page.getByRole('button', { name: 'Apply timestamp' }).first().click();
  await page.getByLabel('Version name (optional)').fill('Embed UTC version');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Draft saved. No message has been posted.'),
  ).toBeVisible();
  const updated = (await state(request)).templates.find(
    (template: { id: string }) => template.id === saved.id,
  );
  expect(updated.versions[0].document.embeds[0].url).toBe(
    'https://example.com/community',
  );
  expect(updated.versions[0].document.embeds[0].timestamp).toBe(
    '2026-11-01T13:15:00.000Z',
  );
});

test('named version preview, duplication and restore preserve an unsaved editor draft', async ({
  page,
  request,
}) => {
  await openStudio(page);
  await page.getByLabel('Design name').fill('M2 history design');
  await page.getByLabel('Version name (optional)').fill('Original welcome');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Draft saved. No message has been posted.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Text ## Sparko support/ }).click();
  await page
    .getByLabel('Text', { exact: true })
    .fill('## Updated history welcome');
  await page.getByLabel('Version name (optional)').fill('Updated welcome');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Draft saved. No message has been posted.'),
  ).toBeVisible();
  await page
    .getByLabel('Text', { exact: true })
    .fill('## Keep my unsaved welcome');
  const template = (await state(request)).templates.find(
    (record: { name: string }) => record.name === 'M2 history design',
  );
  const row = page
    .locator('.template-row')
    .filter({ has: page.getByText('M2 history design', { exact: true }) });
  await row.getByRole('button', { name: 'Versions and preview' }).click();
  await page
    .getByRole('button', { name: 'Version 1 · Original welcome' })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Sparko support' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate this version' }).click();
  await page.getByLabel('New template name').fill('M2 copied welcome');
  await page.getByRole('button', { name: 'Create template copy' }).click();
  await expect(
    page.getByText('Template copy created. Your editor draft has been kept.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore this version' }).click();
  await page.getByLabel('Restored version name').fill('Restored original');
  await page.getByRole('button', { name: 'Confirm version restore' }).click();
  await expect(
    page.getByText(
      'Version restored as saved revision 3. Your editor draft has been kept.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close history' }).click();
  await expect(
    row.getByRole('button', { name: 'Versions and preview' }),
  ).toBeFocused();
  await expect(page.getByLabel('Text', { exact: true })).toHaveValue(
    '## Keep my unsaved welcome',
  );
  const saved = (await state(request)).templates.find(
    (record: { id: string }) => record.id === template.id,
  );
  expect(saved.versions).toHaveLength(3);
  expect(saved.versions[2].id).toBe(template.versions[1].id);
  expect(saved.versions[0].label).toBe('Restored original');
  expect(saved.versions[0].document).toEqual(saved.versions[2].document);
  await page
    .getByLabel('Version name (optional)')
    .fill('Draft after reviewed restore');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Draft saved. No message has been posted.'),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await state(request)).templates.find(
          (record: { id: string }) => record.id === template.id,
        )?.revision,
    )
    .toBe(4);
  await page
    .getByLabel('Text', { exact: true })
    .fill('## Keep my unsaved welcome again');
  await row.getByRole('button', { name: 'Versions and preview' }).click();
  await page
    .getByRole('button', { name: 'Version 1 · Original welcome' })
    .click();
  await page.getByRole('button', { name: 'Open version as draft' }).click();
  await page.getByRole('button', { name: 'Return to previous draft' }).click();
  await page
    .getByRole('button', { name: /^Text ## Keep my unsaved w/ })
    .click();
  await expect(page.getByLabel('Text', { exact: true })).toHaveValue(
    '## Keep my unsaved welcome again',
  );
});

test('custom emoji fallback, permission drift and missing-message checks show canonical delivery state', async ({
  page,
  request,
}) => {
  await openStudio(page);
  await page.getByLabel('Design name').fill('M2 reconciliation design');
  await privateControl(page);
  await page.getByLabel('Button 1 emoji type').selectOption('custom');
  await page.getByLabel('Button 1 custom emoji ID').fill('933456789012345679');
  await page.getByLabel('Button 1 custom emoji name').fill('unavailable_spark');
  await page.getByLabel('Button 1 Unicode fallback').fill('✨');
  await page
    .getByRole('button', { name: 'Apply button 1 emoji', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Draft saved. No message has been posted.'),
  ).toBeVisible();
  await page
    .getByLabel('Discord destination')
    .selectOption('623456789012345678');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  let publicationId = '';
  await expect
    .poll(async () => {
      const publication = (await state(request)).publications.find(
        (record: { document: { name: string } }) =>
          record.document.name === 'M2 reconciliation design',
      );
      publicationId = publication?.id ?? '';
      return publication?.state;
    })
    .toBe('applied');
  let snapshot = await state(request);
  const publication = snapshot.publications.find(
    (record: { id: string }) => record.id === publicationId,
  );
  const message = snapshot.messages.find(
    (record: { id: string }) => record.id === publication.messageId,
  );
  expect(JSON.stringify(message.components)).toContain('✨');
  expect(JSON.stringify(message.components)).not.toContain(
    '933456789012345679',
  );
  await page.getByRole('button', { name: 'Edit publication' }).first().click();
  await page.getByRole('button', { name: /^Text ## Sparko support/ }).click();
  await page
    .getByLabel('Text', { exact: true })
    .fill('## Permission drift demo');
  await request.post('http://localhost:3001/__test/discord/writes', {
    data: { fail: true },
  });
  await page.getByRole('button', { name: 'Update published message' }).click();
  await expect
    .poll(
      async () =>
        (await state(request)).outbox.find(
          (job: { type: string; payload: { publicationId: string } }) =>
            job.type === 'publication.update' &&
            job.payload.publicationId === publicationId,
        )?.state,
    )
    .toBe('blocked');
  await page.reload();
  await expect(
    page.getByText('Your design is saved. Discord delivery needs attention.'),
  ).toBeVisible();
  await request.post('http://localhost:3001/__test/discord/writes', {
    data: { fail: false },
  });
  await page
    .getByRole('button', { name: 'Check Discord message' })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).publications.find(
          (record: { id: string }) => record.id === publicationId,
        )?.state,
    )
    .toBe('conflict');
  snapshot = await state(request);
  expect(
    snapshot.messages.filter(
      (record: { id: string }) => record.id === publication.messageId,
    ),
  ).toHaveLength(1);
  await request.post(
    `http://localhost:3001/__test/discord/messages/${publication.messageId}/delete`,
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Check Discord message' })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        (await state(request)).publications.find(
          (record: { id: string }) => record.id === publicationId,
        )?.state,
    )
    .toBe('missing');
  await page.reload();
  await expect(
    page.getByText(
      'The original Discord message or channel is missing. Review a replacement before posting again.',
    ),
  ).toBeVisible();
  expect((await state(request)).publications).toHaveLength(
    snapshot.publications.length,
  );
});
