import type { LibraryMove, StudioFolder, StudioTemplate } from './types';

/**
 * Templates and folders share one order inside each folder. These helpers
 * work on that shape for the sample data and for showing a move at once,
 * before the server confirms it.
 */
export type Library = { templates: StudioTemplate[]; folders: StudioFolder[] };
export type LibraryItem =
  | { kind: 'template'; id: string; item: StudioTemplate }
  | { kind: 'folder'; id: string; item: StudioFolder };

/** What's directly inside a folder (or the top level), in order. */
export function itemsIn(lib: Library, folderId: string | null): LibraryItem[] {
  return [
    ...lib.templates
      .filter((t) => t.folderId === folderId)
      .map((t) => ({ kind: 'template' as const, id: t.id, item: t })),
    ...lib.folders
      .filter((f) => f.parentId === folderId)
      .map((f) => ({ kind: 'folder' as const, id: f.id, item: f })),
  ].sort((a, b) => a.item.position - b.item.position);
}

/** The folder and every folder inside it. */
export function folderTree(lib: Library, id: string) {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of lib.folders)
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
  }
  return ids;
}

/** How much a folder holds, at any depth. */
export function folderContents(lib: Library, id: string) {
  const tree = folderTree(lib, id);
  return {
    templates: lib.templates.filter((t) => t.folderId && tree.has(t.folderId))
      .length,
    folders: tree.size - 1,
  };
}

/** The folders from the top level down to `id`. */
export function folderPath(lib: Library, id: string | null) {
  const path: StudioFolder[] = [];
  for (
    let f = lib.folders.find((x) => x.id === id);
    f && path.length <= lib.folders.length;
    f = lib.folders.find((x) => x.id === f!.parentId)
  )
    path.unshift(f);
  return path;
}

/** Whether a move would put a folder inside itself. */
export const movesIntoItself = (lib: Library, move: LibraryMove) =>
  move.kind === 'folder' &&
  move.folderId !== null &&
  folderTree(lib, move.id).has(move.folderId);

/** The library after a move, with positions renumbered where it lands. */
export function applyMove(lib: Library, move: LibraryMove): Library {
  if (movesIntoItself(lib, move)) return lib;
  const items = itemsIn(lib, move.folderId).filter(
    (x) => !(x.kind === move.kind && x.id === move.id),
  );
  const at = Math.max(0, Math.min(move.index, items.length));
  const order = [
    ...items.slice(0, at).map((x) => `${x.kind}:${x.id}`),
    `${move.kind}:${move.id}`,
    ...items.slice(at).map((x) => `${x.kind}:${x.id}`),
  ];
  const placed = (kind: string, id: string) => order.indexOf(`${kind}:${id}`);
  return {
    templates: lib.templates.map((t) => {
      const i = placed('template', t.id);
      return i < 0 ? t : { ...t, folderId: move.folderId, position: i };
    }),
    folders: lib.folders.map((f) => {
      const i = placed('folder', f.id);
      return i < 0 ? f : { ...f, parentId: move.folderId, position: i };
    }),
  };
}

const nameKey = (name: string) => name.trim().toLowerCase();
/** Whether another template already has this name (names ignore case). */
export const nameTaken = (
  templates: { id: string; name: string }[],
  name: string,
  exceptId?: string,
) =>
  templates.some((t) => t.id !== exceptId && nameKey(t.name) === nameKey(name));
/** The name, or "name (x2)", "name (x3)"… when it's taken, as the server does. */
export function uniqueTemplateName(
  templates: { id: string; name: string }[],
  name: string,
) {
  if (!nameTaken(templates, name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (x${n})`;
    const next = name.slice(0, 80 - suffix.length) + suffix;
    if (!nameTaken(templates, next)) return next;
  }
}
