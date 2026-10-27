import { transaction, type Db } from './db.ts';
import type { ImageDesign } from './images.ts';
import { Plain } from './ticket-actions.ts';

/** Image studio's saved images, newest change first. */
export type StoredImage = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** The PNG drawn from the design when it was last saved. */
  url: string;
  who: string;
  at: number;
  design: ImageDesign;
};

type Row = Record<string, unknown>;
const toImage = (r: Row): StoredImage => ({
  id: String(r.id),
  name: r.name as string,
  width: r.width as number,
  height: r.height as number,
  url: r.url as string,
  who: r.who_name as string,
  at: r.updated_at as number,
  design: JSON.parse(r.json as string) as ImageDesign,
});

export function listImages(db: Db, guildId: string) {
  return (
    db
      .prepare(
        'SELECT * FROM studio_images WHERE guild_id = ? ORDER BY updated_at DESC, id DESC',
      )
      .all(guildId) as Row[]
  ).map(toImage);
}

export function countImages(db: Db, guildId: string) {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM studio_images WHERE guild_id = ?')
      .get(guildId) as { n: number }
  ).n;
}

function getRow(db: Db, guildId: string, id: string) {
  const row = db
    .prepare('SELECT * FROM studio_images WHERE guild_id = ? AND id = ?')
    .get(guildId, Number(id)) as Row | undefined;
  if (!row) throw new Plain('That image no longer exists.');
  return row;
}

const nameKey = (name: string) => name.trim().toLowerCase();
function takenNames(db: Db, guildId: string, exceptId?: string) {
  return new Set(
    (
      db
        .prepare('SELECT id, name FROM studio_images WHERE guild_id = ?')
        .all(guildId) as Row[]
    )
      .filter((r) => String(r.id) !== exceptId)
      .map((r) => nameKey(r.name as string)),
  );
}
/** A name already used gets " (x2)", " (x3)" and so on. */
function uniqueImageName(db: Db, guildId: string, name: string) {
  const taken = takenNames(db, guildId);
  if (!taken.has(nameKey(name))) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (x${n})`;
    const next = name.slice(0, 80 - suffix.length) + suffix;
    if (!taken.has(nameKey(next))) return next;
  }
}

/** Saves a new image and returns its id. */
export function addImage(
  db: Db,
  i: {
    guildId: string;
    name: string;
    who: string;
    design: ImageDesign;
    url: string;
  },
  now: number,
) {
  return transaction(db, () => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO studio_images (guild_id, name, json, width, height, url, who_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        i.guildId,
        uniqueImageName(db, i.guildId, i.name),
        JSON.stringify(i.design),
        i.design.width,
        i.design.height,
        i.url,
        i.who,
        now,
      );
    return String(lastInsertRowid);
  });
}

/** Renames an image, or saves a new design (and its PNG) into it. */
export function updateImage(
  db: Db,
  guildId: string,
  id: string,
  change: { name?: string; design?: ImageDesign; url?: string; who: string },
  now: number,
) {
  const row = getRow(db, guildId, id);
  if (
    change.name !== undefined &&
    takenNames(db, guildId, id).has(nameKey(change.name))
  )
    throw new Plain(
      `An image named “${change.name.trim()}” already exists. Pick another name.`,
    );
  const design = change.design;
  db.prepare(
    'UPDATE studio_images SET name = ?, json = ?, width = ?, height = ?, url = ?, who_name = ?, updated_at = ? WHERE id = ?',
  ).run(
    change.name ?? (row.name as string),
    design ? JSON.stringify(design) : (row.json as string),
    design?.width ?? (row.width as number),
    design?.height ?? (row.height as number),
    change.url ?? (row.url as string),
    change.who,
    now,
    Number(id),
  );
}

/** Copies an image; the copy shares the PNG until it's saved again. */
export function cloneImage(
  db: Db,
  guildId: string,
  id: string,
  who: string,
  now: number,
) {
  return transaction(db, () => {
    const row = getRow(db, guildId, id);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO studio_images (guild_id, name, json, width, height, url, who_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        guildId,
        uniqueImageName(
          db,
          guildId,
          `${row.name as string} (copy)`.slice(0, 80),
        ),
        row.json as string,
        row.width as number,
        row.height as number,
        row.url as string,
        who,
        now,
      );
    return String(lastInsertRowid);
  });
}

export function deleteImage(db: Db, guildId: string, id: string) {
  db.prepare('DELETE FROM studio_images WHERE guild_id = ? AND id = ?').run(
    guildId,
    Number(id),
  );
}
