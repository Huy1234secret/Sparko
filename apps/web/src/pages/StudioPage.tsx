import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { z } from 'zod';
import {
  ControlRowSchema,
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
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { MessagePreview, PREVIEW_CONTEXT } from '../components/MessagePreview';
import { getChannels } from '../services/guilds';
import {
  createTemplate,
  createVersion,
  getPublications,
  getTemplates,
  publishMessage,
  testMessage,
  archivePublication,
  type Template,
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

export function StudioPage() {
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
  const [channelId, setChannelId] = useState('');
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>(
    'desktop',
  );
  const [inspector, setInspector] = useState(false);
  const [conversion, setConversion] = useState<MessageDocument['mode'] | null>(
    null,
  );
  const [importError, setImportError] = useState('');
  const [autoSave, setAutoSave] = useState(false);
  const [undoStack, setUndoStack] = useState<MessageDocument[]>([]);
  const [redoStack, setRedoStack] = useState<MessageDocument[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(document) !== savedDocument;
  const templates = useQuery({
    queryKey: ['templates', guildId],
    queryFn: ({ signal }) => getTemplates(guildId, signal),
  });
  const channels = useQuery({
    queryKey: ['channels', guildId],
    queryFn: ({ signal }) => getChannels(guildId, signal),
  });
  const publications = useQuery({
    queryKey: ['publications', guildId],
    queryFn: ({ signal }) => getPublications(guildId, signal),
    refetchInterval: 15000,
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
    mutationFn: (snapshot: MessageDocument) =>
      template
        ? createVersion(
            guildId,
            template,
            snapshot,
            identity('template-version', {
              id: template.id,
              revision: template.revision,
              document: snapshot,
            }),
          )
        : createTemplate(
            guildId,
            snapshot,
            identity('template-create', snapshot),
          ),
    onSuccess: (result, snapshot) => {
      setTemplate(result.data);
      setSavedDocument(JSON.stringify(snapshot));
      void queryClient.invalidateQueries({ queryKey: ['templates', guildId] });
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
  const current = selectBlock(document, selected);
  const editBlock = (block: MessageBlock) => {
    if (selected) change(updateBlock(document, selected, block));
  };
  const addBlock = (block: MessageBlock) => {
    if (document.mode !== 'v2') return;
    const next = structuredClone(document);
    next.blocks.push(block);
    change(next);
    setSelected({ top: next.blocks.length - 1 });
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
      if (copy.type === 'controls')
        copy.controls.forEach((control) => {
          control.key = `${control.key}-copy-${crypto.randomUUID().slice(0, 5)}`;
        });
      addBlock(copy);
    }
  };
  const loadTemplate = (item: Template) => {
    if (!item.document) return;
    if (
      dirty &&
      !window.confirm('Discard your unsaved edits and open this template?')
    )
      return;
    setDocument(item.document);
    setSavedDocument(JSON.stringify(item.document));
    setTemplate(item);
    setUndoStack([]);
    setRedoStack([]);
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
      const input: unknown = JSON.parse(await file.text());
      const parsed = MessageDocumentSchema.parse(input);
      change(parsed);
      setTemplate(null);
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
      <DraftGuard dirty={dirty} />
      <PageHeading
        eyebrow="Messages & design"
        title="Make it feel like your community."
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
              onClick={() => document.mode !== mode && setConversion(mode)}
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
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            disabled={!redoStack.length}
            aria-label="Redo edit"
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
      <div className="studio-layout">
        <section className="card studio-blocks">
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
                          url: 'https://panel.coin-sprite.com/sparko.svg',
                          alt: 'Sparko spark mascot',
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
            <div className="stack">
              <Field
                label="Content"
                htmlFor="embed-content"
                hint="Traditional messages can contain ordinary content. V2 messages use blocks."
              >
                <textarea
                  id="embed-content"
                  value={document.content ?? ''}
                  onChange={(e) =>
                    document.mode === 'embed' &&
                    change({ ...document, content: e.target.value })
                  }
                />
              </Field>
              {document.embeds.map((embed, index) => (
                <div className="stack embed-editor" key={index}>
                  <Field label="Embed title" htmlFor={`embed-title-${index}`}>
                    <Input
                      id={`embed-title-${index}`}
                      value={embed.title ?? ''}
                      maxLength={256}
                      onChange={(e) => {
                        if (document.mode !== 'embed') return;
                        const embeds = [...document.embeds];
                        embeds[index] = { ...embed, title: e.target.value };
                        change({ ...document, embeds });
                      }}
                    />
                  </Field>
                  <Field
                    label="Description"
                    htmlFor={`embed-description-${index}`}
                  >
                    <textarea
                      id={`embed-description-${index}`}
                      value={embed.description ?? ''}
                      maxLength={4096}
                      onChange={(e) => {
                        if (document.mode !== 'embed') return;
                        const embeds = [...document.embeds];
                        embeds[index] = {
                          ...embed,
                          description: e.target.value,
                        };
                        change({ ...document, embeds });
                      }}
                    />
                  </Field>
                  <Field label="Accent color" htmlFor={`embed-color-${index}`}>
                    <Input
                      type="color"
                      id={`embed-color-${index}`}
                      value={`#${embed.color.toString(16).padStart(6, '0')}`}
                      onChange={(e) => {
                        if (document.mode !== 'embed') return;
                        const embeds = [...document.embeds];
                        embeds[index] = {
                          ...embed,
                          color: Number.parseInt(e.target.value.slice(1), 16),
                        };
                        change({ ...document, embeds });
                      }}
                    />
                  </Field>
                  <Field label="Footer" htmlFor={`embed-footer-${index}`}>
                    <Input
                      id={`embed-footer-${index}`}
                      value={embed.footer?.text ?? ''}
                      onChange={(e) => {
                        if (document.mode !== 'embed') return;
                        const embeds = [...document.embeds];
                        embeds[index] = {
                          ...embed,
                          footer: { text: e.target.value },
                        };
                        change({ ...document, embeds });
                      }}
                    />
                  </Field>
                  <Field label="Image URL" htmlFor={`embed-image-${index}`}>
                    <Input
                      id={`embed-image-${index}`}
                      value={embed.image ?? ''}
                      onChange={(e) => {
                        if (document.mode !== 'embed') return;
                        const embeds = [...document.embeds];
                        embeds[index] = { ...embed, image: e.target.value };
                        change({ ...document, embeds });
                      }}
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (document.mode !== 'embed') return;
                      const embeds = [...document.embeds];
                      embeds[index] = {
                        ...embed,
                        fields: [
                          ...(embed.fields ?? []),
                          {
                            name: 'Field name',
                            value: 'Field value',
                            inline: false,
                          },
                        ],
                      };
                      change({ ...document, embeds });
                    }}
                  >
                    Add embed field
                  </Button>
                  {embed.fields?.map((field, fieldIndex) => (
                    <div key={fieldIndex} className="form-grid">
                      <Input
                        aria-label={`Field ${fieldIndex + 1} name`}
                        value={field.name}
                        onChange={(e) => {
                          if (document.mode !== 'embed') return;
                          const next = structuredClone(document);
                          const target =
                            next.embeds[index]?.fields?.[fieldIndex];
                          if (target) target.name = e.target.value;
                          change(next);
                        }}
                      />
                      <Input
                        aria-label={`Field ${fieldIndex + 1} value`}
                        value={field.value}
                        onChange={(e) => {
                          if (document.mode !== 'embed') return;
                          const next = structuredClone(document);
                          const target =
                            next.embeds[index]?.fields?.[fieldIndex];
                          if (target) target.value = e.target.value;
                          change(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="studio-canvas">
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
            <div className="alert alert-danger" role="alert">
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
          <Card>
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
              )}
              {current.type === 'gallery' &&
                current.items.map((item, index) => (
                  <div className="stack" key={index}>
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
                  </div>
                ))}
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
              {current.type === 'controls' &&
                current.controls.map((control, index) =>
                  control.type === 'button' ? (
                    <div className="stack" key={control.key}>
                      <Field
                        label="Button label"
                        htmlFor={`button-label-${index}`}
                      >
                        <Input
                          id={`button-label-${index}`}
                          value={control.label}
                          onChange={(e) => {
                            const parsed = MessageDocumentSchema.safeParse(
                              updateBlock(
                                document,
                                selected ?? { top: 0 },
                                ControlRowSchema.parse({
                                  ...current,
                                  controls: current.controls.map((item, i) =>
                                    i === index
                                      ? { ...item, label: e.target.value }
                                      : item,
                                  ),
                                }),
                              ),
                            );
                            if (parsed.success) change(parsed.data);
                          }}
                        />
                      </Field>
                      {control.style === 'link' ? (
                        <Field
                          label="Destination URL"
                          htmlFor={`button-url-${index}`}
                        >
                          <Input
                            id={`button-url-${index}`}
                            value={control.url}
                            onChange={(e) => {
                              const controls = current.controls.map(
                                (item, i) =>
                                  i === index &&
                                  item.type === 'button' &&
                                  item.style === 'link'
                                    ? { ...item, url: e.target.value }
                                    : item,
                              );
                              editBlock(
                                ControlRowSchema.parse({
                                  ...current,
                                  controls,
                                }),
                              );
                            }}
                          />
                        </Field>
                      ) : (
                        <div>
                          <Badge>{control.action.type}</Badge>
                          <p className="field-hint">
                            Action configuration is validated with the message
                            document. Actor permissions are checked again when
                            used.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p key={control.key} className="muted">
                      Select menu: {control.options.length} validated options
                    </p>
                  ),
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
          <Card>
            <h3>Save & delivery</h3>
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
                    ? 'A newer version exists. Your local draft is retained; open the latest template to review it.'
                    : errorMessage(save.error)
                }
              />
            )}
            {save.isSuccess && !dirty && (
              <p className="save-feedback" role="status">
                <CheckCircle2 size={16} />
                Draft saved. No message has been posted.
              </p>
            )}
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
              <p className="save-feedback" role="status">
                {delivery.data.data.deliveryStatus === 'delivered'
                  ? 'Discord delivery confirmed.'
                  : `Delivery ${delivery.data.data.deliveryStatus}. Your design is saved.`}
              </p>
            )}
          </Card>
        </aside>
      </div>
      {importError && <ErrorState message={importError} />}
      <div className="overview-grid">
        <Card>
          <h2>Your template library</h2>
          {templates.isPending ? (
            <LoadingState />
          ) : templates.error ? (
            <ErrorState
              message={errorMessage(templates.error)}
              retry={() => void templates.refetch()}
            />
          ) : templates.data?.length ? (
            templates.data.map((item) => (
              <button
                className="template-row"
                key={item.id}
                disabled={!item.document}
                onClick={() => loadTemplate(item)}
              >
                <FileText size={18} />
                <span>
                  {item.name}
                  <small>Revision {item.revision}</small>
                </span>
              </button>
            ))
          ) : (
            <EmptyState
              title="Your first design belongs here"
              description="Save a draft to create an immutable version in your server’s template library."
            />
          )}
        </Card>
        <Card>
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
        </Card>
      </div>
      <Dialog.Root
        open={!!conversion}
        onOpenChange={(open) => !open && setConversion(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
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
