import { transaction, type Db } from './db.ts';
import { Plain } from './ticket-actions.ts';

/**
 * Saved message templates and the folders that hold them. Templates and
 * folders share one order inside each folder (or at the top level), so the
 * dashboard can show them mixed, the way people arrange them.
 */
export type LibraryKind = 'template' | 'folder';
export type StoredTemplate<T> = {
  id: string;
  name: string;
  folderId: string | null;
  position: number;
  /** Who saved it last, and when. */
  who: string;
  at: number;
  message: T;
};
export type StoredFolder = {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
};

/** How many templates and folders each plan can keep. */
export const libraryLimits = (plan: 'free' | 'plus' | undefined) =>
  plan === 'plus'
    ? { templates: 500, folders: 100 }
    : { templates: 100, folders: 20 };

/** "Saved 5 min ago by Rhea", for a template card. */
export function savedLine(at: number, now: number, who: string) {
  const min = Math.round((now - at) / 60_000);
  const h = Math.round(min / 60);
  const d = Math.round(h / 24);
  const when =
    min < 1
      ? 'just now'
      : min < 60
        ? `${min} min ago`
        : h < 24
          ? `${h} h ago`
          : d === 1
            ? 'yesterday'
            : d < 7
              ? `${d} days ago`
              : `on ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  return `Saved ${when} by ${who}`;
}

type Row = Record<string, unknown>;
const idOf = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (id: string | null) => (id === null ? null : Number(id));

export function listLibrary<T>(db: Db, guildId: string, moduleId: string) {
  const templates = (
    db
      .prepare(
        'SELECT * FROM templates WHERE guild_id = ? AND module_id = ? ORDER BY position, id DESC',
      )
      .all(guildId, moduleId) as Row[]
  ).map(
    (r): StoredTemplate<T> => ({
      id: String(r.id),
      name: r.name as string,
      folderId: idOf(r.folder_id),
      position: r.position as number,
      who: r.who_name as string,
      at: r.created_at as number,
      message: JSON.parse(r.json as string) as T,
    }),
  );
  const folders = (
    db
      .prepare(
        'SELECT * FROM template_folders WHERE guild_id = ? AND module_id = ? ORDER BY position, id DESC',
      )
      .all(guildId, moduleId) as Row[]
  ).map(
    (r): StoredFolder => ({
      id: String(r.id),
      name: r.name as string,
      parentId: idOf(r.parent_id),
      position: r.position as number,
    }),
  );
  return { templates, folders };
}

function folderExists(db: Db, guildId: string, moduleId: string, id: string) {
  return !!db
    .prepare(
      'SELECT 1 FROM template_folders WHERE guild_id = ? AND module_id = ? AND id = ?',
    )
    .get(guildId, moduleId, Number(id));
}
function needFolder(
  db: Db,
  guildId: string,
  moduleId: string,
  id: string | null,
) {
  if (id !== null && !folderExists(db, guildId, moduleId, id))
    throw new Plain('That folder no longer exists.');
}

/** Everything directly inside a folder (or the top level), in order. */
function container(
  db: Db,
  guildId: string,
  moduleId: string,
  folderId: string | null,
) {
  const rows = [
    ...(
      db
        .prepare(
          'SELECT id, position FROM templates WHERE guild_id = ? AND module_id = ? AND folder_id IS ?',
        )
        .all(guildId, moduleId, num(folderId)) as Row[]
    ).map((r) => ({
      kind: 'template' as const,
      id: String(r.id),
      position: r.position as number,
    })),
    ...(
      db
        .prepare(
          'SELECT id, position FROM template_folders WHERE guild_id = ? AND module_id = ? AND parent_id IS ?',
        )
        .all(guildId, moduleId, num(folderId)) as Row[]
    ).map((r) => ({
      kind: 'folder' as const,
      id: String(r.id),
      position: r.position as number,
    })),
  ];
  return rows.sort(
    (a, b) => a.position - b.position || Number(b.id) - Number(a.id),
  );
}

function renumber(
  db: Db,
  items: { kind: LibraryKind; id: string }[],
  folderId: string | null,
) {
  const t = db.prepare(
    'UPDATE templates SET position = ?, folder_id = ? WHERE id = ?',
  );
  const f = db.prepare(
    'UPDATE template_folders SET position = ?, parent_id = ? WHERE id = ?',
  );
  items.forEach((item, i) =>
    (item.kind === 'template' ? t : f).run(i, num(folderId), Number(item.id)),
  );
}

/** Puts an item at `index` among the items in `folderId`. */
function place(
  db: Db,
  guildId: string,
  moduleId: string,
  item: { kind: LibraryKind; id: string },
  folderId: string | null,
  index: number,
) {
  const items: { kind: LibraryKind; id: string }[] = container(
    db,
    guildId,
    moduleId,
    folderId,
  ).filter((x) => !(x.kind === item.kind && x.id === item.id));
  const at = Math.max(0, Math.min(Math.trunc(index), items.length));
  items.splice(at, 0, item);
  renumber(db, items, folderId);
}

export function countLibrary(db: Db, guildId: string, moduleId: string) {
  const count = (table: string) =>
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM ${table} WHERE guild_id = ? AND module_id = ?`,
        )
        .get(guildId, moduleId) as { n: number }
    ).n;
  return {
    templates: count('templates'),
    folders: count('template_folders'),
  };
}

/** Saves a new template at the top of its folder and returns its id. */
export function addTemplate(
  db: Db,
  t: {
    guildId: string;
    moduleId: string;
    name: string;
    who: string;
    message: unknown;
    folderId?: string | null;
  },
  now: number,
) {
  const folderId = t.folderId ?? null;
  return transaction(db, () => {
    needFolder(db, t.guildId, t.moduleId, folderId);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO templates (guild_id, module_id, name, json, who_name, created_at, folder_id, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, -1)`,
      )
      .run(
        t.guildId,
        t.moduleId,
        t.name,
        JSON.stringify(t.message),
        t.who,
        now,
        num(folderId),
      );
    const id = String(lastInsertRowid);
    place(db, t.guildId, t.moduleId, { kind: 'template', id }, folderId, 0);
    return id;
  });
}

function getTemplateRow(db: Db, guildId: string, moduleId: string, id: string) {
  const row = db
    .prepare(
      'SELECT * FROM templates WHERE guild_id = ? AND module_id = ? AND id = ?',
    )
    .get(guildId, moduleId, Number(id)) as Row | undefined;
  if (!row) throw new Plain('That template no longer exists.');
  return row;
}

/** Renames a template or saves a new message into it. */
export function updateTemplate(
  db: Db,
  guildId: string,
  moduleId: string,
  id: string,
  change: { name?: string; message?: unknown; who: string },
  now: number,
) {
  const row = getTemplateRow(db, guildId, moduleId, id);
  db.prepare(
    'UPDATE templates SET name = ?, json = ?, who_name = ?, created_at = ? WHERE id = ?',
  ).run(
    change.name ?? (row.name as string),
    change.message === undefined
      ? (row.json as string)
      : JSON.stringify(change.message),
    change.who,
    now,
    Number(id),
  );
}

/** Copies a template and puts the copy right after it. */
export function cloneTemplate(
  db: Db,
  guildId: string,
  moduleId: string,
  id: string,
  who: string,
  now: number,
) {
  return transaction(db, () => {
    const row = getTemplateRow(db, guildId, moduleId, id);
    const folderId = idOf(row.folder_id);
    const name = `${row.name as string} (copy)`.slice(0, 80);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO templates (guild_id, module_id, name, json, who_name, created_at, folder_id, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        guildId,
        moduleId,
        name,
        row.json as string,
        who,
        now,
        num(folderId),
      );
    const copy = String(lastInsertRowid);
    const items = container(db, guildId, moduleId, folderId);
    const index = items.findIndex((x) => x.kind === 'template' && x.id === id);
    place(
      db,
      guildId,
      moduleId,
      { kind: 'template', id: copy },
      folderId,
      index + 1,
    );
    return copy;
  });
}

export function deleteTemplate(
  db: Db,
  guildId: string,
  moduleId: string,
  id: string,
) {
  db.prepare(
    'DELETE FROM templates WHERE guild_id = ? AND module_id = ? AND id = ?',
  ).run(guildId, moduleId, Number(id));
}

export function addFolder(
  db: Db,
  f: {
    guildId: string;
    moduleId: string;
    name: string;
    parentId?: string | null;
  },
  now: number,
) {
  const parentId = f.parentId ?? null;
  return transaction(db, () => {
    needFolder(db, f.guildId, f.moduleId, parentId);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO template_folders (guild_id, module_id, name, parent_id, position, created_at)
         VALUES (?, ?, ?, ?, -1, ?)`,
      )
      .run(f.guildId, f.moduleId, f.name, num(parentId), now);
    const id = String(lastInsertRowid);
    place(db, f.guildId, f.moduleId, { kind: 'folder', id }, parentId, 0);
    return id;
  });
}

export function renameFolder(
  db: Db,
  guildId: string,
  moduleId: string,
  id: string,
  name: string,
) {
  needFolder(db, guildId, moduleId, id);
  db.prepare('UPDATE template_folders SET name = ? WHERE id = ?').run(
    name,
    Number(id),
  );
}

/** The folder and every folder inside it, at any depth. */
function subtree(db: Db, guildId: string, moduleId: string, id: string) {
  const { folders } = listLibrary(db, guildId, moduleId);
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders)
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
  }
  return [...ids];
}

/** Deletes a folder with everything in it, and says how much went. */
export function deleteFolder(
  db: Db,
  guildId: string,
  moduleId: string,
  id: string,
) {
  return transaction(db, () => {
    needFolder(db, guildId, moduleId, id);
    const ids = subtree(db, guildId, moduleId, id).map(Number);
    const marks = ids.map(() => '?').join(', ');
    const templates = db
      .prepare(
        `DELETE FROM templates WHERE guild_id = ? AND module_id = ? AND folder_id IN (${marks})`,
      )
      .run(guildId, moduleId, ...ids).changes;
    db.prepare(
      `DELETE FROM template_folders WHERE guild_id = ? AND module_id = ? AND id IN (${marks})`,
    ).run(guildId, moduleId, ...ids);
    return { templates: Number(templates), folders: ids.length - 1 };
  });
}

/** Moves a template or folder into `folderId` (null: the top) at `index`. */
export function moveLibraryItem(
  db: Db,
  guildId: string,
  moduleId: string,
  move: {
    kind: LibraryKind;
    id: string;
    folderId: string | null;
    index: number;
  },
) {
  transaction(db, () => {
    if (move.kind === 'template')
      getTemplateRow(db, guildId, moduleId, move.id);
    else needFolder(db, guildId, moduleId, move.id);
    needFolder(db, guildId, moduleId, move.folderId);
    if (
      move.kind === 'folder' &&
      move.folderId !== null &&
      subtree(db, guildId, moduleId, move.id).includes(move.folderId)
    )
      throw new Plain('A folder can’t go inside itself.');
    place(
      db,
      guildId,
      moduleId,
      { kind: move.kind, id: move.id },
      move.folderId,
      move.index,
    );
  });
}
