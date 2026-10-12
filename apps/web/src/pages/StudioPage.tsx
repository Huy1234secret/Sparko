import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { z } from 'zod';
import {
  MessageDocumentSchema,
  compileMessage,
  convertMessageMode,
  getMessageActions,
  initialMessage,
  modeChangeLossReport,
  TOKEN_REGISTRY,
  type MessageBlock,
  type MessageDocument,
  type TokenName,
} from '@sparko/messages';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  ImagePlus,
  Layers3,
  Monitor,
  Plus,
  Redo2,
  Save,
  Send,
  Smartphone,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  PageHeading,
} from '@sparko/ui';
import { MessagePreview, PREVIEW_CONTEXT } from '../components/MessagePreview';
import { getChannels, getRoles, getEmojis } from '../services/guilds';
import { ControlEditor } from '../components/ControlEditor';
import { EmbedEditor } from '../components/EmbedEditor';
import { GalleryPicker } from '../components/GalleryPicker';
import { TemplateLibrary } from '../components/TemplateLibrary';
import {
  createTemplate,
  createVersion,
  getPublications,
  getTemplates,
  publishMessage,
  testMessage,
  archivePublication,
  type Template,
  type Publication,
  updatePublication,
  reconcilePublication,
  type TemplateVersion,
} from '../services/messages';
import { ApiError, errorMessage } from '../services/http';
import { useActionIdentity } from '../hooks/useActionIdentity';
import { DraftGuard } from '../hooks/useDraftGuard';

type BlockPosition = { top: number; child?: number };
function selectBlock(
  document: MessageDocument,
  position: BlockPosition | null,
): MessageBlock | undefined {
  if (!position) return undefined;
  const top = document.blocks[position.top];
  return position.child === undefined
    ? top
    : top?.type === 'container'
      ? top.children[position.child]
      : undefined;
}
function updateBlock(
  document: MessageDocument,
  position: BlockPosition,
  block: MessageBlock,
): MessageDocument {
  const copy = structuredClone(document);
  if (copy.mode !== 'v2') return copy;
  if (position.child !== undefined) {
    const parent = copy.blocks[position.top];
    if (parent?.type === 'container' && block.type !== 'container')
      parent.children[position.child] = block;
  } else copy.blocks[position.top] = block;
  return copy;
}
function labelFor(block: MessageBlock) {
  return {
    container: 'Container',
    text: 'Text',
    section: 'Section',
    gallery: 'Media gallery',
    separator: 'Separator',
    file: 'Attachment',
    controls: 'Controls',
  }[block.type];
}
function isTokenName(value: string): value is TokenName {
  return Object.hasOwn(TOKEN_REGISTRY, value);
}
function PublicationFeedback({ publication }: { publication: Publication }) {
  const confirmed =
    publication.state === 'applied' &&
    publication.appliedRevision === publication.revision &&
    publication.deliveryStatus === 'applied';
  const message =
    publication.state === 'missing'
      ? 'The original Discord message or channel is missing. Review a replacement before posting again.'
      : publication.state === 'conflict'
        ? 'The Discord message differs from this saved publication. Review its current content before replacing it.'
        : confirmed
          ? 'Discord delivery confirmed.'
          : ['unknown', 'uncertain'].includes(publication.deliveryStatus)
            ? 'Discord delivery could not be confirmed. Check the original message before posting again.'
            : ['blocked', 'failed'].includes(publication.deliveryStatus)
              ? 'Your design is saved. Discord delivery needs attention.'
              : `Delivery ${publication.deliveryStatus}. Your design is saved.`;
  return (
    <div className="stack">
      <p role="status">{message}</p>
      {publication.error && <p className="field-error">{publication.error}</p>}
    </div>
  );
}

export function StudioPage({
  section,
}: {
  /** Deep link to the template library or publication inventory. */
  section?: 'templates' | 'publications' | undefined;
} = {}) {
  const { guildId = '' } = useParams();
  useEffect(() => {
    if (!section) return;
    const target = window.document.getElementById(
      section === 'templates' ? 'template-library' : 'publication-inventory',
    );
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [section, guildId]);
  return <StudioEditor key={guildId} />;
}

function StudioEditor() {
  const { guildId = '' } = useParams();
  const queryClient = useQueryClient();
  const identity = useActionIdentity();
  const [document, setDocument] = useState<MessageDocument>(() =>
    initialMessage(),
  );
  const [savedDocument, setSavedDocument] = useState(() =>
    JSON.stringify(initialMessage()),
  );
  const [selected, setSelected] = useState<BlockPosition | null>({ top: 0 });
  const [template, setTemplate] = useState<Template | null>(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [preservedDraft, setPreservedDraft] = useState<{
    document: MessageDocument;
    savedDocument: string;
    template: Template | null;
    publication: Publication | null;
    versionLabel: string;
  } | null>(null);
  const [channelId, setChannelId] = useState('');
  const [editingPublication, setEditingPublication] =
    useState<Publication | null>(null);
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>(
    'desktop',
  );
  const [inspector, setInspector] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [conversion, setConversion] = useState<MessageDocument['mode'] | null>(
    null,
  );
  const [importError, setImportError] = useState('');
  const [autoSave, setAutoSave] = useState(false);
  const [undoStack, setUndoStack] = useState<MessageDocument[]>([]);
  const [redoStack, setRedoStack] = useState<MessageDocument[]>([]);
  const [insertInside, setInsertInside] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorContext = useRef(0);
  const mediaOpener = useRef<HTMLElement | null>(null);
  const replacementOpener = useRef<HTMLElement | null>(null);
  const conversionOpener = useRef<HTMLElement | null>(null);
  const dirty = JSON.stringify(document) !== savedDocument;
  const templates = useQuery({
    queryKey: ['templates', guildId],
    queryFn: ({ signal }) => getTemplates(guildId, signal),
  });
  const channels = useQuery({
    queryKey: ['channels', guildId],
    queryFn: ({ signal }) => getChannels(guildId, signal),
  });
  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: ({ signal }) => getRoles(guildId, signal),
  });
  const emojis = useQuery({
    queryKey: ['emojis', guildId],
    queryFn: ({ signal }) => getEmojis(guildId, signal),
  });
  const publications = useQuery({
    queryKey: ['publications', guildId],
    queryFn: ({ signal }) => getPublications(guildId, signal),
    refetchInterval: (query) =>
      query.state.data?.some((publication) =>
        ['pending', 'retrying'].includes(publication.deliveryStatus),
      )
        ? 2000
        : 15000,
  });
  const compiled = useMemo(() => {
    try {
      const controls = Object.fromEntries(
        getMessageActions(document).map((action, i) => [
          action.key,
          `spk:ctl:preview_${i}`,
        ]),
      );
      return {
        payload: compileMessage(document, PREVIEW_CONTEXT, controls),
        issues: [] as string[],
      };
    } catch (error) {
      return {
        payload: null,
        issues:
          error instanceof z.ZodError
            ? error.issues.map(
                (issue) =>
                  `${issue.path.join('.') || 'Message'}: ${issue.message}`,
              )
            : [errorMessage(error)],
      };
    }
  }, [document]);
  const save = useMutation({
    mutationFn: async (snapshot: MessageDocument) => {
      const context = editorContext.current;
      const label = versionLabel.trim();
      const result = await (template
        ? createVersion(
            guildId,
            template,
            snapshot,
            identity('template-version', {
              id: template.id,
              revision: template.revision,
              document: snapshot,
              label,
            }),
            label || undefined,
          )
        : createTemplate(
            guildId,
            snapshot,
            identity('template-create', {
              document: snapshot,
              label,
            }),
            label || undefined,
          ));
      return { ...result, context, label };
    },
    onSuccess: (result, snapshot) => {
      void queryClient.invalidateQueries({ queryKey: ['templates', guildId] });
      void queryClient.invalidateQueries({
        queryKey: ['template-versions', guildId],
      });
      if (result.context !== editorContext.current) return;
      setTemplate(result.data);
      setSavedDocument(JSON.stringify(snapshot));
      setVersionLabel((current) =>
        current.trim() === result.label ? '' : current,
      );
    },
  });
  const delivery = useMutation({
    mutationFn: (mode: 'test' | 'publish') => {
      const body = { channelId, document };
      return mode === 'test'
        ? testMessage(guildId, body, identity('message-test', body))
        : publishMessage(
            guildId,
            { ...body, purpose: 'studio' },
            identity('message-publish', body),
          );
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['publications', guildId],
      }),
  });
  const updateLive = useMutation({
    mutationFn: async (replace: boolean) => {
      if (!editingPublication) throw new Error('Choose a publication first.');
      const context = editorContext.current;
      const body = {
        id: editingPublication.id,
        expectedRevision: editingPublication.revision,
        document,
        replace,
      };
      const result = await updatePublication(
        guildId,
        editingPublication,
        document,
        replace,
        identity('publication-update', body),
      );
      return { ...result, context };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ['publications', guildId],
      });
      if (result.context !== editorContext.current) return;
      setEditingPublication(result.data);
      setReplacementOpen(false);
    },
  });
  let replacementRequired = false;
  const publicationLosses: string[] = [];
  if (editingPublication?.document) {
    if (
      ['missing', 'conflict'].includes(
        publications.data?.find(
          (publication) => publication.id === editingPublication.id,
        )?.state ?? editingPublication.state,
      )
    ) {
      replacementRequired = true;
      publicationLosses.push(
        'The original message is missing or differs from the saved design. A replacement posts a new message and revokes the old controls.',
      );
    }
    try {
      if (editingPublication.document.mode !== document.mode) {
        replacementRequired = true;
        publicationLosses.push(
          ...modeChangeLossReport(
            editingPublication.document,
            document.mode,
          ).losses.map((loss) => loss.reason),
        );
      }
      if (
        JSON.stringify(getMessageActions(editingPublication.document)) !==
        JSON.stringify(getMessageActions(document))
      ) {
        replacementRequired = true;
        publicationLosses.push(
          'Existing controls will be revoked; a replacement message receives new controls.',
        );
      }
    } catch {
      replacementRequired = true;
    }
  }
  const archive = useMutation({
    mutationFn: (id: string) =>
      archivePublication(
        guildId,
        id,
        publications.data?.find((publication) => publication.id === id)
          ?.revision ?? 0,
        identity('archive', {
          id,
          revision: publications.data?.find(
            (publication) => publication.id === id,
          )?.revision,
        }),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['publications', guildId],
      }),
  });
  const reconcile = useMutation({
    mutationFn: (publication: Publication) =>
      reconcilePublication(
        guildId,
        publication,
        identity('publication-reconcile', {
          id: publication.id,
          revision: publication.revision,
        }),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['publications', guildId],
      }),
  });
  useEffect(() => {
    if (
      !autoSave ||
      !dirty ||
      compiled.issues.length ||
      save.isPending ||
      save.error
    )
      return;
    const timer = window.setTimeout(() => save.mutate(document), 2500);
    return () => window.clearTimeout(timer);
  }, [autoSave, dirty, document, compiled.issues.length, save]);
  const change = (next: MessageDocument) => {
    setUndoStack((items) => [...items.slice(-39), document]);
    setRedoStack([]);
    setDocument(next);
    save.reset();
    delivery.reset();
  };
  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((items) => [...items, document]);
    setUndoStack((items) => items.slice(0, -1));
    setDocument(previous);
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((items) => [...items, document]);
    setRedoStack((items) => items.slice(0, -1));
    setDocument(next);
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Text fields keep their own native undo.
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });
  const current = selectBlock(document, selected);
  const editBlock = (block: MessageBlock) => {
    if (selected) change(updateBlock(document, selected, block));
  };
  const addBlock = (block: MessageBlock) => {
    if (document.mode !== 'v2') return;
    const next = structuredClone(document);
    const parentIndex = selected?.top;
    const parent =
      parentIndex === undefined ? undefined : next.blocks[parentIndex];
    if (
      insertInside &&
      parent?.type === 'container' &&
      block.type !== 'container'
    ) {
      parent.children.push(block);
      change(next);
      setSelected({ top: parentIndex ?? 0, child: parent.children.length - 1 });
    } else {
      next.blocks.push(block);
      change(next);
      setSelected({ top: next.blocks.length - 1 });
    }
  };
  const move = (direction: -1 | 1) => {
    if (!selected || document.mode !== 'v2') return;
    const next = structuredClone(document);
    const parent = next.blocks[selected.top];
    const list =
      selected.child !== undefined && parent?.type === 'container'
        ? parent.children
        : next.blocks;
    const index = selected.child ?? selected.top;
    const target = index + direction;
    const item = list[index];
    const other = list[target];
    if (!item || !other) return;
    if (
      selected.child !== undefined &&
      parent?.type === 'container' &&
      item.type !== 'container' &&
      other.type !== 'container'
    ) {
      parent.children[index] = other;
      parent.children[target] = item;
      setSelected({ top: selected.top, child: target });
    } else {
      next.blocks[index] = other;
      next.blocks[target] = item;
      setSelected({ top: target });
    }
    change(next);
  };
  const remove = () => {
    if (!selected || document.mode !== 'v2') return;
    const next = structuredClone(document);
    const top = next.blocks[selected.top];
    if (selected.child !== undefined && top?.type === 'container')
      top.children.splice(selected.child, 1);
    else next.blocks.splice(selected.top, 1);
    change(next);
    setSelected(null);
  };
  const duplicate = () => {
    if (current) {
      const copy = structuredClone(current);
      const renewKeys = (block: MessageBlock) => {
        if (block.type === 'container') block.children.forEach(renewKeys);
        if (block.type === 'controls')
          block.controls.forEach((control) => {
            control.key = `copy-${crypto.randomUUID().slice(0, 12)}`;
          });
        if (block.type === 'section' && block.accessory.type === 'button')
          block.accessory.key = `copy-${crypto.randomUUID().slice(0, 12)}`;
      };
      renewKeys(copy);
      addBlock(copy);
    }
  };
  const loadTemplate = (item: Template, version: TemplateVersion) => {
    if (dirty)
      setPreservedDraft({
        document: structuredClone(document),
        savedDocument,
        template,
        publication: editingPublication,
        versionLabel,
      });
    editorContext.current += 1;
    change(structuredClone(version.document));
    setSavedDocument(JSON.stringify(item.document ?? version.document));
    setTemplate(item);
    setEditingPublication(null);
    setAutoSave(false);
    setVersionLabel('');
    setSelected({ top: 0 });
  };
  const exportDocument = () => {
    const blob = new Blob(
      [JSON.stringify(MessageDocumentSchema.parse(document), null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.sparko.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importDocument = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 256 * 1024) {
      setImportError('Message documents must be smaller than 256 KB.');
      return;
    }
    try {
      const context = editorContext.current;
      const input: unknown = JSON.parse(await file.text());
      const parsed = MessageDocumentSchema.parse(input);
      if (context !== editorContext.current) return;
      editorContext.current += 1;
      change(parsed);
      setTemplate(null);
      setEditingPublication(null);
      setImportError('');
    } catch (error) {
      setImportError(
        error instanceof z.ZodError
          ? error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join(' · ')
          : 'Choose a valid Sparko message document.',
      );
    }
  };
  return (
    <>
      <DraftGuard dirty={dirty || !!preservedDraft} />
      <PageHeading
        eyebrow="Messages & design"
        title="Message Studio"
        description="Design once. Save a version. Publish a real message with a clear delivery state."
        actions={
          <div className="row">
            <Button
              variant="secondary"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={15} />
              Import
            </Button>
            <Button
              variant="secondary"
              onClick={(event) => {
                mediaOpener.current = event.currentTarget;
                setMediaOpen(true);
              }}
            >
              <ImagePlus size={15} />
              Media library
            </Button>
            <Button
              variant="secondary"
              disabled={compiled.issues.length > 0}
              onClick={exportDocument}
            >
              <Download size={15} />
              Export
            </Button>
          </div>
        }
      />
      <input
        type="file"
        className="sr-only"
        aria-label="Message file to import"
        tabIndex={-1}
        ref={fileInput}
        accept="application/json,.json"
        onChange={(event) => void importDocument(event.target.files?.[0])}
      />
      <div className="studio-toolbar">
        <div className="tabs" aria-label="Discord output mode">
          {(['v2', 'embed'] as const).map((mode) => (
            <button
              key={mode}
              className={document.mode === mode ? 'active' : ''}
              aria-pressed={document.mode === mode}
              onClick={(event) => {
                if (document.mode !== mode) {
                  conversionOpener.current = event.currentTarget;
                  setConversion(mode);
                }
              }}
            >
              {mode === 'v2' ? 'Components V2' : 'Traditional embed'}
            </button>
          ))}
        </div>
        <div className="row">
          <button
            className="icon-button"
            disabled={!undoStack.length}
            aria-label="Undo edit"
            aria-keyshortcuts="Control+Z"
            title="Undo (Ctrl+Z)"
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            disabled={!redoStack.length}
            aria-label="Redo edit"
            aria-keyshortcuts="Control+Shift+Z Control+Y"
            title="Redo (Ctrl+Shift+Z)"
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
          <Button variant="secondary" onClick={() => setInspector(!inspector)}>
            <Code2 size={16} />
            Payload
          </Button>
        </div>
      </div>
      <p className="field-hint studio-mode-hint">
        {document.mode === 'v2'
          ? 'Components V2 lays out text, images and buttons as blocks inside containers. Use it for new panels.'
          : 'A traditional embed has a title, description, fields and an image. Use it when a channel or bot expects embeds.'}
      </p>
      <div className="studio-status">
        <span className="save-state" role="status" aria-live="polite">
          {(dirty || !template) && (
            <span className="dirty-dot" aria-hidden="true" />
          )}
          {save.isPending
            ? 'Saving…'
            : !template
              ? dirty
                ? 'New design · not saved yet'
                : 'New design'
              : dirty
                ? `Unsaved changes since version ${template.revision}`
                : `Saved as version ${template.revision} of “${template.name}”`}
          {autoSave && <Badge tone="info">Autosave on</Badge>}
        </span>
        {compiled.issues.length > 0 ? (
          <a className="text-link danger-text" href="#studio-issues">
            {compiled.issues.length} problem
            {compiled.issues.length === 1 ? '' : 's'} to fix
          </a>
        ) : (
          <span className="muted">Design is valid</span>
        )}
        <nav aria-label="Studio sections" className="studio-jump">
          <a href="#studio-blocks">Blocks</a>
          <a href="#studio-preview">Preview</a>
          <a href="#studio-properties">Properties</a>
          <a href="#studio-delivery">Save & publish</a>
          <a href="#template-library">Templates</a>
          <a href="#publication-inventory">Publications</a>
        </nav>
      </div>
      <div className="studio-layout">
        <section className="card studio-blocks" id="studio-blocks">
          <div className="section-heading">
            <h2>
              {document.mode === 'v2' ? 'Content blocks' : 'Embed editor'}
            </h2>
            <Layers3 size={17} />
          </div>
          {document.mode === 'v2' ? (
            <>
              <div className="block-list">
                {document.blocks.map((block, top) => (
                  <div key={top}>
                    <button
                      className={`block-item ${selected?.top === top && selected.child === undefined ? 'selected' : ''}`}
                      onClick={() => setSelected({ top })}
                    >
                      <FileText size={16} />
                      <span>{labelFor(block)}</span>
                      <small>{top + 1}</small>
                    </button>
                    {block.type === 'container' &&
                      block.children.map((child, childIndex) => (
                        <button
                          key={childIndex}
                          className={`block-item child ${selected?.top === top && selected.child === childIndex ? 'selected' : ''}`}
                          onClick={() =>
                            setSelected({ top, child: childIndex })
                          }
                        >
                          <span>{labelFor(child)}</span>
                          <small>
                            {child.type === 'text'
                              ? child.text.slice(0, 20)
                              : ''}
                          </small>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
              <div className="block-add">
                <p className="nav-label">ADD A BLOCK</p>
                <Field
                  label="Add new blocks to"
                  htmlFor="block-insertion-target"
                >
                  <select
                    id="block-insertion-target"
                    value={
                      insertInside &&
                      document.blocks[selected?.top ?? -1]?.type === 'container'
                        ? 'container'
                        : 'message'
                    }
                    onChange={(event) =>
                      setInsertInside(event.target.value === 'container')
                    }
                  >
                    <option value="message">Message</option>
                    {document.blocks[selected?.top ?? -1]?.type ===
                      'container' && (
                      <option value="container">Selected container</option>
                    )}
                  </select>
                  <p className="field-hint">
                    Containers always appear at message level.
                  </p>
                </Field>
                <button
                  onClick={() =>
                    addBlock({ type: 'text', text: 'Your message goes here.' })
                  }
                >
                  <Plus size={15} />
                  Text
                </button>
                <button
                  onClick={() =>
                    addBlock({
                      type: 'container',
                      accentColor: 16436245,
                      children: [
                        {
                          type: 'text',
                          text: 'A little spark for your community.',
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Container
                </button>
                <button
                  onClick={() =>
                    addBlock({ type: 'separator', divider: true, spacing: 1 })
                  }
                >
                  <Plus size={15} />
                  Separator
                </button>
                <button
                  onClick={() =>
                    addBlock({
                      type: 'section',
                      texts: ['A helpful section'],
                      accessory: {
                        type: 'button',
                        key: `link-${crypto.randomUUID().slice(0, 8)}`,
                        label: 'Open dashboard',
                        style: 'link',
                        url: 'https://panel.coin-sprite.com/dashboard',
                      },
                    })
                  }
                >
                  <Plus size={15} />
                  Section
                </button>
                <button
                  onClick={() =>
                    addBlock({
                      type: 'controls',
                      controls: [
                        {
                          type: 'button',
                          key: `action-${crypto.randomUUID().slice(0, 8)}`,
                          label: 'Open a ticket',
                          style: 'primary',
                          action: {
                            type: 'ticket.create',
                            categoryId: 'general',
                          },
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Button row
                </button>
                <button
                  onClick={() =>
                    addBlock({
                      type: 'gallery',
                      items: [
                        {
                          url: 'https://panel.coin-sprite.com/og-image.png',
                          alt: 'Sparko community illustration',
                        },
                      ],
                    })
                  }
                >
                  <ImagePlus size={15} />
                  Media gallery
                </button>
              </div>
            </>
          ) : (
            <EmbedEditor
              document={document}
              onChange={change}
              resources={{
                channels: channels.data ?? [],
                roles: roles.data ?? [],
                emojis: emojis.data ?? [],
              }}
            />
          )}
        </section>
        <section className="studio-canvas" id="studio-preview">
          <div className="preview-toolbar">
            <span>
              <Eye size={16} />
              Live design preview
            </span>
            <div className="tabs">
              <button
                aria-label="Desktop preview"
                aria-pressed={previewWidth === 'desktop'}
                onClick={() => setPreviewWidth('desktop')}
              >
                <Monitor size={17} />
              </button>
              <button
                aria-label="Mobile preview"
                aria-pressed={previewWidth === 'mobile'}
                onClick={() => setPreviewWidth('mobile')}
              >
                <Smartphone size={17} />
              </button>
            </div>
          </div>
          <div className={`studio-preview ${previewWidth}`}>
            <MessagePreview document={document} />
          </div>
          {inspector && (
            <Card>
              <h3>Compiled Discord payload</h3>
              <p className="field-hint">
                Preview control identities are demonstrations. The server issues
                persisted controls at publication.
              </p>
              <pre className="payload-inspector">
                {JSON.stringify(compiled.payload, null, 2)}
              </pre>
            </Card>
          )}
          {compiled.issues.length > 0 && (
            <div className="alert alert-danger" role="alert" id="studio-issues">
              <div>
                <strong>
                  Fix these design issues before saving or publishing.
                </strong>
                <ul>
                  {compiled.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
        <aside className="stack">
          <Card id="studio-properties">
            <h2>Design properties</h2>
            <Field label="Design name" htmlFor="design-name">
              <Input
                id="design-name"
                value={document.name}
                maxLength={100}
                onChange={(e) => change({ ...document, name: e.target.value })}
              />
            </Field>
            <Field label="Event context" htmlFor="token-context">
              <select
                id="token-context"
                value={document.tokenContext}
                onChange={(e) => {
                  const context = z
                    .enum(['generic', 'member', 'ticket', 'level', 'giveaway'])
                    .parse(e.target.value);
                  change({ ...document, tokenContext: context });
                }}
              >
                <option value="generic">General message</option>
                <option value="member">Member</option>
                <option value="ticket">Ticket</option>
                <option value="level">Level</option>
                <option value="giveaway">Giveaway</option>
              </select>
            </Field>
            <Field label="Visibility" htmlFor="design-visibility">
              <select
                id="design-visibility"
                value={document.visibility}
                onChange={(e) =>
                  change({
                    ...document,
                    visibility:
                      e.target.value === 'private' ? 'private' : 'public',
                  })
                }
              >
                <option value="public">Public message</option>
                <option value="private">Private response</option>
              </select>
            </Field>
            <p className="field-hint">
              Private designs cannot be published into a public channel.
            </p>
          </Card>
          {document.mode === 'v2' && current && (
            <Card>
              <div className="section-heading">
                <h2>{labelFor(current)}</h2>
                <div className="row">
                  <button
                    className="icon-button"
                    aria-label="Move block up"
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move block down"
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Duplicate block"
                    onClick={duplicate}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label="Delete block"
                    onClick={remove}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {current.type === 'text' && (
                <Field label="Text" htmlFor="block-text">
                  <textarea
                    id="block-text"
                    rows={7}
                    maxLength={4000}
                    value={current.text}
                    onChange={(e) =>
                      editBlock({ ...current, text: e.target.value })
                    }
                  />
                  <small>{current.text.length} / 4000 characters</small>
                </Field>
              )}
              {current.type === 'container' && (
                <Field label="Accent color" htmlFor="container-color">
                  <Input
                    id="container-color"
                    type="color"
                    value={`#${current.accentColor.toString(16).padStart(6, '0')}`}
                    onChange={(e) =>
                      editBlock({
                        ...current,
                        accentColor: Number.parseInt(
                          e.target.value.slice(1),
                          16,
                        ),
                      })
                    }
                  />
                </Field>
              )}
              {current.type === 'section' && (
                <div className="stack">
                  <Field label="Section text" htmlFor="section-text">
                    <textarea
                      id="section-text"
                      value={current.texts.join('\n\n')}
                      onChange={(e) =>
                        editBlock({
                          ...current,
                          texts: e.target.value.split('\n\n').slice(0, 3),
                        })
                      }
                    />
                  </Field>
                  <Field label="Section accessory" htmlFor="section-accessory">
                    <select
                      id="section-accessory"
                      value={current.accessory.type}
                      onChange={(event) =>
                        editBlock({
                          ...current,
                          accessory:
                            event.target.value === 'thumbnail'
                              ? {
                                  type: 'thumbnail',
                                  url: 'https://panel.coin-sprite.com/og-image.png',
                                  alt: 'Sparko community illustration',
                                }
                              : {
                                  type: 'button',
                                  key: `section-${crypto.randomUUID().slice(0, 8)}`,
                                  label: 'Learn more',
                                  style: 'secondary',
                                  action: {
                                    type: 'response.private',
                                    text: 'Thanks for taking a look.',
                                  },
                                },
                        })
                      }
                    >
                      <option value="button">Button</option>
                      <option value="thumbnail">Thumbnail image</option>
                    </select>
                  </Field>
                  {current.accessory.type === 'thumbnail' ? (
                    <>
                      <Field
                        label="Thumbnail image URL"
                        htmlFor="section-thumbnail-url"
                      >
                        <Input
                          id="section-thumbnail-url"
                          value={current.accessory.url}
                          onChange={(event) => {
                            if (current.accessory.type === 'thumbnail')
                              editBlock({
                                ...current,
                                accessory: {
                                  ...current.accessory,
                                  url: event.target.value,
                                },
                              });
                          }}
                        />
                      </Field>
                      <Field
                        label="Thumbnail alternative text"
                        htmlFor="section-thumbnail-alt"
                      >
                        <Input
                          id="section-thumbnail-alt"
                          maxLength={1024}
                          value={current.accessory.alt ?? ''}
                          onChange={(event) => {
                            if (current.accessory.type === 'thumbnail')
                              editBlock({
                                ...current,
                                accessory: {
                                  ...current.accessory,
                                  alt: event.target.value,
                                },
                              });
                          }}
                        />
                      </Field>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={current.accessory.spoiler ?? false}
                          onChange={(event) => {
                            if (current.accessory.type === 'thumbnail')
                              editBlock({
                                ...current,
                                accessory: {
                                  ...current.accessory,
                                  spoiler: event.target.checked,
                                },
                              });
                          }}
                        />
                        Hide thumbnail until revealed
                      </label>
                      <Button
                        variant="secondary"
                        onClick={(event) => {
                          mediaOpener.current = event.currentTarget;
                          setMediaOpen(true);
                        }}
                      >
                        Choose thumbnail from library
                      </Button>
                    </>
                  ) : (
                    <ControlEditor
                      singleButton
                      row={{ type: 'controls', controls: [current.accessory] }}
                      resources={{
                        channels: channels.data ?? [],
                        roles: roles.data ?? [],
                        emojis: emojis.data ?? [],
                      }}
                      onChange={(row) => {
                        const button = row.controls[0];
                        if (button?.type === 'button')
                          editBlock({ ...current, accessory: button });
                      }}
                    />
                  )}
                </div>
              )}
              {current.type === 'gallery' &&
                current.items.map((item, index) => (
                  <div className="stack card" key={index}>
                    <Field label="Media URL" htmlFor={`media-url-${index}`}>
                      <Input
                        id={`media-url-${index}`}
                        value={item.url}
                        onChange={(e) => {
                          const items = [...current.items];
                          items[index] = { ...item, url: e.target.value };
                          editBlock({ ...current, items });
                        }}
                      />
                    </Field>
                    <Field
                      label="Alternative text"
                      htmlFor={`media-alt-${index}`}
                    >
                      <Input
                        id={`media-alt-${index}`}
                        value={item.alt ?? ''}
                        onChange={(e) => {
                          const items = [...current.items];
                          items[index] = { ...item, alt: e.target.value };
                          editBlock({ ...current, items });
                        }}
                      />
                    </Field>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={item.spoiler ?? false}
                        onChange={(event) => {
                          const items = [...current.items];
                          items[index] = {
                            ...item,
                            spoiler: event.target.checked,
                          };
                          editBlock({ ...current, items });
                        }}
                      />
                      Hide image until revealed
                    </label>
                    <Button
                      variant="ghost"
                      disabled={current.items.length === 1}
                      onClick={() =>
                        editBlock({
                          ...current,
                          items: current.items.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      Remove gallery image {index + 1}
                    </Button>
                  </div>
                ))}
              {current.type === 'gallery' && (
                <div className="row wrap">
                  <Button
                    variant="secondary"
                    disabled={current.items.length >= 10}
                    onClick={() => {
                      const item = current.items.at(-1);
                      if (item)
                        editBlock({
                          ...current,
                          items: [...current.items, { ...item }],
                        });
                    }}
                  >
                    Add gallery image
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={current.items.length >= 10}
                    onClick={(event) => {
                      mediaOpener.current = event.currentTarget;
                      setMediaOpen(true);
                    }}
                  >
                    Add image from library
                  </Button>
                  <small>{current.items.length} / 10 images</small>
                </div>
              )}
              {current.type === 'separator' && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={current.divider}
                    onChange={(e) =>
                      editBlock({ ...current, divider: e.target.checked })
                    }
                  />
                  Show divider line
                </label>
              )}
              {current.type === 'file' && (
                <Field
                  label="Validated attachment reference"
                  htmlFor="file-reference"
                >
                  <Input
                    id="file-reference"
                    value={current.url}
                    onChange={(e) =>
                      editBlock({ ...current, url: e.target.value })
                    }
                  />
                </Field>
              )}
              {current.type === 'controls' && (
                <ControlEditor
                  row={current}
                  resources={{
                    channels: channels.data ?? [],
                    roles: roles.data ?? [],
                    emojis: emojis.data ?? [],
                  }}
                  onChange={editBlock}
                />
              )}
            </Card>
          )}
          <Card>
            <h3>Available tokens</h3>
            <p className="field-hint">
              Select a token to add it to this document’s allowlist. Paste its
              syntax into text.
            </p>
            <div className="token-list">
              {Object.keys(TOKEN_REGISTRY)
                .filter(isTokenName)
                .filter((token) =>
                  (
                    TOKEN_REGISTRY[token].contexts as readonly string[]
                  ).includes(document.tokenContext),
                )
                .map((token) => (
                  <button
                    key={token}
                    title={TOKEN_REGISTRY[token].description}
                    className={
                      document.allowedTokens.includes(token) ? 'active' : ''
                    }
                    onClick={() => {
                      if (!document.allowedTokens.includes(token))
                        change({
                          ...document,
                          allowedTokens: [...document.allowedTokens, token],
                        });
                      void navigator.clipboard?.writeText(`{{${token}}}`);
                    }}
                  >{`{{${token}}}`}</button>
                ))}
            </div>
          </Card>
          <Card id="studio-delivery">
            <h3>Save & publish</h3>
            <p className="field-hint">
              Saving keeps a private version. Nothing appears in Discord until
              you publish.
            </p>
            <p className="step-title">
              <span className="step-index">1</span> Save a version
            </p>
            {preservedDraft && (
              <div className="stack">
                <p className="field-hint">
                  Your previous editor draft is kept.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    editorContext.current += 1;
                    change(structuredClone(preservedDraft.document));
                    setSavedDocument(preservedDraft.savedDocument);
                    setTemplate(preservedDraft.template);
                    setEditingPublication(preservedDraft.publication);
                    setVersionLabel(preservedDraft.versionLabel);
                    setPreservedDraft(null);
                    setSelected({ top: 0 });
                  }}
                >
                  Return to previous draft
                </Button>
              </div>
            )}
            <Field
              label="Version name (optional)"
              htmlFor="studio-version-label"
            >
              <Input
                id="studio-version-label"
                value={versionLabel}
                maxLength={100}
                placeholder="For example: Spring support panel"
                onChange={(event) => setVersionLabel(event.target.value)}
              />
            </Field>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              Autosave valid drafts
            </label>
            <Button
              busy={save.isPending}
              disabled={!dirty || !!compiled.issues.length}
              onClick={() => save.mutate(document)}
            >
              <Save size={16} />
              Save draft
            </Button>
            {save.error && (
              <ErrorState
                message={
                  save.error instanceof ApiError &&
                  save.error.code === 'REVISION_CONFLICT'
                    ? 'A newer version exists. Your local draft is retained. Review the saved history, then refresh its revision to save your draft as a new version.'
                    : errorMessage(save.error)
                }
              />
            )}
            {save.error instanceof ApiError &&
              save.error.code === 'REVISION_CONFLICT' &&
              template && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const context = editorContext.current;
                    const refreshed = await templates.refetch();
                    if (context !== editorContext.current) return;
                    const latest = refreshed.data?.find(
                      (item) => item.id === template.id,
                    );
                    if (!latest) return;
                    setTemplate(latest);
                    setSavedDocument(JSON.stringify(latest.document));
                    save.reset();
                  }}
                >
                  Refresh saved revision, keep this draft
                </Button>
              )}
            {save.isSuccess && !dirty && (
              <p className="save-feedback" role="status">
                <CheckCircle2 size={16} />
                Draft saved. No message has been posted.
              </p>
            )}
            <p className="step-title">
              <span className="step-index">2</span> Choose where it goes
            </p>
            <Field label="Discord destination" htmlFor="studio-channel">
              <select
                id="studio-channel"
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value);
                  delivery.reset();
                }}
              >
                <option value="">Choose a channel</option>
                {channels.data
                  ?.filter((channel) => [0, 5].includes(channel.type))
                  .map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      # {channel.name}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="step-title">
              <span className="step-index">3</span> Test, then publish
            </p>
            <div className="row">
              <Button
                variant="secondary"
                busy={delivery.isPending}
                disabled={
                  !channelId ||
                  !!compiled.issues.length ||
                  document.visibility === 'private'
                }
                onClick={() => delivery.mutate('test')}
              >
                Send test
              </Button>
              <Button
                busy={delivery.isPending}
                disabled={
                  !channelId ||
                  dirty ||
                  !!compiled.issues.length ||
                  document.visibility === 'private'
                }
                onClick={() => delivery.mutate('publish')}
              >
                <Send size={16} />
                Publish
              </Button>
            </div>
            {editingPublication && (
              <div className="stack">
                <p className="field-hint">
                  Editing publication in #
                  {channels.data?.find(
                    (channel) => channel.id === editingPublication.channelId,
                  )?.name ?? editingPublication.channelId}
                  , revision {editingPublication.revision}. Saving a draft and
                  updating the live message are separate actions.
                </p>
                <Button
                  variant="secondary"
                  busy={updateLive.isPending}
                  disabled={
                    !!compiled.issues.length ||
                    document.visibility === 'private'
                  }
                  onClick={(event) => {
                    if (replacementRequired) {
                      replacementOpener.current = event.currentTarget;
                      setReplacementOpen(true);
                    } else updateLive.mutate(false);
                  }}
                >
                  {replacementRequired
                    ? 'Review replacement'
                    : 'Update published message'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    editorContext.current += 1;
                    setEditingPublication(null);
                    updateLive.reset();
                  }}
                >
                  Stop editing publication
                </Button>
                {updateLive.error && (
                  <ErrorState
                    message={
                      updateLive.error instanceof ApiError &&
                      updateLive.error.code === 'REVISION_CONFLICT'
                        ? 'This publication changed. Your draft is retained. Refresh the inventory and reopen its latest snapshot before retrying.'
                        : errorMessage(updateLive.error)
                    }
                  />
                )}
                {updateLive.data && (
                  <div>
                    <p>Publication update saved.</p>
                    <PublicationFeedback
                      publication={
                        publications.data?.find(
                          (item) => item.id === updateLive.data?.data.id,
                        ) ?? updateLive.data.data
                      }
                    />
                  </div>
                )}
              </div>
            )}
            <p className="field-hint">
              {dirty
                ? 'Save your draft before publishing.'
                : !channelId
                  ? 'Choose a destination for test or publication.'
                  : document.visibility === 'private'
                    ? 'Use a private design in actor-bound interactions; channel publication is unavailable.'
                    : 'Test posts are labeled. Publication uses a durable delivery operation.'}
            </p>
            {delivery.error && (
              <ErrorState message={errorMessage(delivery.error)} />
            )}
            {delivery.data && (
              <PublicationFeedback
                publication={
                  publications.data?.find(
                    (item) => item.id === delivery.data?.data.id,
                  ) ?? delivery.data.data
                }
              />
            )}
          </Card>
        </aside>
      </div>
      {importError && <ErrorState message={importError} />}
      <div className="overview-grid studio-library">
        <TemplateLibrary
          guildId={guildId}
          templates={templates.data ?? []}
          pending={templates.isPending}
          error={templates.error}
          onRetry={() => void templates.refetch()}
          onOpen={loadTemplate}
          onRestored={(id, version) => {
            const restored = (item: Template): Template => ({
              ...item,
              revision: version.number,
              document: structuredClone(version.document),
              versions: [
                version,
                ...item.versions.filter((saved) => saved.id !== version.id),
              ],
            });
            setTemplate((current) =>
              current?.id === id ? restored(current) : current,
            );
            if (template?.id === id)
              setSavedDocument(JSON.stringify(version.document));
            setPreservedDraft((current) =>
              current?.template?.id === id
                ? {
                    ...current,
                    template: restored(current.template),
                    savedDocument: JSON.stringify(version.document),
                  }
                : current,
            );
          }}
          dirty={dirty}
        />
        <Card id="publication-inventory" tabIndex={-1}>
          <h2>Publication inventory</h2>
          {publications.data?.length ? (
            publications.data.map((publication) => (
              <div className="activity-row" key={publication.id}>
                <span>
                  <strong>
                    #
                    {channels.data?.find(
                      (channel) => channel.id === publication.channelId,
                    )?.name ?? publication.channelId}
                  </strong>
                  <small>
                    {new Date(publication.createdAt).toLocaleString()}
                  </small>
                </span>
                <Badge>{publication.deliveryStatus}</Badge>
                {['missing', 'conflict'].includes(publication.state) && (
                  <Badge>{publication.state}</Badge>
                )}
                <Button
                  variant="secondary"
                  disabled={
                    !publication.document ||
                    ['archived', 'replaced'].includes(publication.state)
                  }
                  onClick={() => {
                    if (!publication.document) return;
                    if (
                      dirty &&
                      !window.confirm(
                        'Discard your unsaved edits and open the published snapshot?',
                      )
                    )
                      return;
                    editorContext.current += 1;
                    setDocument(structuredClone(publication.document));
                    setSavedDocument(JSON.stringify(publication.document));
                    setTemplate(null);
                    setEditingPublication(publication);
                    setChannelId(publication.channelId);
                    setSelected({ top: 0 });
                    updateLive.reset();
                  }}
                >
                  Edit publication
                </Button>
                <Button
                  variant="secondary"
                  busy={
                    reconcile.isPending &&
                    reconcile.variables?.id === publication.id
                  }
                  disabled={
                    ['archived', 'replaced'].includes(publication.state) ||
                    ['pending', 'running', 'retrying'].includes(
                      publication.deliveryStatus,
                    )
                  }
                  onClick={() => reconcile.mutate(publication)}
                >
                  Check Discord message
                </Button>
                <Button
                  variant="ghost"
                  disabled={publication.status === 'archived'}
                  busy={archive.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Archive this publication and revoke its controls?',
                      )
                    )
                      archive.mutate(publication.id);
                  }}
                >
                  Archive
                </Button>
                {(publication.error ||
                  [
                    'missing',
                    'conflict',
                    'blocked',
                    'failed',
                    'unknown',
                    'uncertain',
                  ].includes(publication.deliveryStatus) ||
                  ['missing', 'conflict'].includes(publication.state)) && (
                  <PublicationFeedback publication={publication} />
                )}
              </div>
            ))
          ) : (
            <p className="muted">
              No publications yet. Saving drafts keeps them private to your
              workspace.
            </p>
          )}
          {archive.error && (
            <ErrorState message={errorMessage(archive.error)} />
          )}
          {reconcile.error && (
            <ErrorState
              message={
                reconcile.error instanceof ApiError &&
                reconcile.error.code === 'REVISION_CONFLICT'
                  ? 'This publication changed. Refresh the inventory and check its current revision; your editor draft is kept.'
                  : errorMessage(reconcile.error)
              }
              retry={() => void publications.refetch()}
            />
          )}
          {reconcile.isSuccess && (
            <p role="status">
              Discord message check requested. It updates the saved status
              without posting a replacement.
            </p>
          )}
        </Card>
      </div>
      <Dialog.Root open={replacementOpen} onOpenChange={setReplacementOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              replacementOpener.current?.focus();
            }}
          >
            <Dialog.Title>Replace this published message?</Dialog.Title>
            <Dialog.Description>
              The existing controls will stop working. Sparko will post a new
              message in the same channel and preserve the old publication
              history.
            </Dialog.Description>
            <ul>
              {publicationLosses.map((loss, index) => (
                <li key={index}>{loss}</li>
              ))}
            </ul>
            {updateLive.error && (
              <ErrorState message={errorMessage(updateLive.error)} />
            )}
            <div className="row">
              <Button
                variant="secondary"
                onClick={() => setReplacementOpen(false)}
              >
                Keep current publication
              </Button>
              <Button
                busy={updateLive.isPending}
                onClick={() => updateLive.mutate(true)}
              >
                Replace published message
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={mediaOpen} onOpenChange={setMediaOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              mediaOpener.current?.focus();
            }}
          >
            <Dialog.Title>Media library</Dialog.Title>
            <Dialog.Description>
              Add your own accessible images to this server’s saved message
              designs.
            </Dialog.Description>
            <GalleryPicker
              guildId={guildId}
              onSelect={(asset) => {
                if (document.mode === 'v2') {
                  if (
                    current?.type === 'section' &&
                    current.accessory.type === 'thumbnail'
                  )
                    editBlock({
                      ...current,
                      accessory: {
                        ...current.accessory,
                        url: asset.url,
                        alt: asset.alt,
                      },
                    });
                  else if (
                    current?.type === 'gallery' &&
                    current.items.length < 10
                  )
                    editBlock({
                      ...current,
                      items: [
                        ...current.items,
                        { url: asset.url, alt: asset.alt },
                      ],
                    });
                  else if (current?.type !== 'gallery')
                    addBlock({
                      type: 'gallery',
                      items: [{ url: asset.url, alt: asset.alt }],
                    });
                } else {
                  const next = structuredClone(document);
                  if (next.embeds[0]) next.embeds[0].image = asset.url;
                  else next.embeds.push({ color: 16436245, image: asset.url });
                  change(next);
                }
                setMediaOpen(false);
              }}
            />
            <Button variant="secondary" onClick={() => setMediaOpen(false)}>
              Close library
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={!!conversion}
        onOpenChange={(open) => !open && setConversion(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              conversionOpener.current?.focus();
            }}
          >
            <Dialog.Title>Change Discord output mode?</Dialog.Title>
            <Dialog.Description>
              Components V2 and traditional embeds are separate modes. Existing
              V2 publications require replacement to use embed mode.
            </Dialog.Description>
            {conversion && (
              <ul>
                {modeChangeLossReport(document, conversion).losses.map(
                  (loss, index) => (
                    <li key={index}>
                      {typeof loss === 'string' ? loss : JSON.stringify(loss)}
                    </li>
                  ),
                )}
              </ul>
            )}
            <div className="row">
              <Button variant="secondary" onClick={() => setConversion(null)}>
                Keep this mode
              </Button>
              <Button
                onClick={() => {
                  if (conversion) {
                    change(convertMessageMode(document, conversion).document);
                    setSelected({ top: 0 });
                    setConversion(null);
                  }
                }}
              >
                Convert draft
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
