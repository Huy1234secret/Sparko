import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
} from '@sparko/ui';
import { MessagePreview } from './MessagePreview';
import { ApiError, errorMessage } from '../services/http';
import {
  duplicateTemplate,
  getTemplateVersions,
  restoreTemplateVersion,
  type Template,
  type TemplateVersion,
} from '../services/messages';
import { useActionIdentity } from '../hooks/useActionIdentity';

export function TemplateLibrary({
  guildId,
  templates,
  pending,
  error,
  onRetry,
  onOpen,
  onRestored,
  dirty,
}: {
  guildId: string;
  templates: Template[];
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (template: Template, version: TemplateVersion) => void;
  onRestored?: (templateId: string, version: TemplateVersion) => void;
  dirty: boolean;
}) {
  const queryClient = useQueryClient();
  const identity = useActionIdentity();
  const opener = useRef<HTMLElement | null>(null);
  const [focused, setFocused] = useState<Template | null>(null);
  const [selected, setSelected] = useState<TemplateVersion | null>(null);
  const [mode, setMode] = useState<'preview' | 'duplicate' | 'restore'>(
    'preview',
  );
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const current =
    templates.find((template) => template.id === focused?.id) ?? focused;
  const versions = useQuery({
    queryKey: ['template-versions', guildId, focused?.id],
    queryFn: ({ signal }) =>
      getTemplateVersions(guildId, focused?.id ?? '', signal),
    enabled: !!focused,
  });
  const preview = selected ?? versions.data?.[0] ?? current?.versions[0];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['templates', guildId] });
    void queryClient.invalidateQueries({
      queryKey: ['template-versions', guildId, focused?.id],
    });
  };
  const duplicate = useMutation({
    mutationFn: async () => {
      if (!current || !preview)
        throw new Error('Choose a saved version first.');
      const body = { name: name.trim(), sourceVersionId: preview.id };
      return duplicateTemplate(
        guildId,
        current,
        body,
        identity('template-duplicate', {
          id: current.id,
          revision: current.revision,
          ...body,
        }),
      );
    },
    onSuccess: refresh,
  });
  const restore = useMutation({
    mutationFn: async () => {
      if (!current || !preview)
        throw new Error('Choose a saved version first.');
      const body = {
        versionId: preview.id,
        ...(label.trim() ? { label: label.trim() } : {}),
      };
      const templateId = current.id;
      const result = await restoreTemplateVersion(
        guildId,
        current,
        body,
        identity('template-restore', {
          id: current.id,
          revision: current.revision,
          ...body,
        }),
      );
      return { ...result, templateId };
    },
    onSuccess: (result) => {
      refresh();
      onRestored?.(result.templateId, result.data);
    },
  });
  const mutationError = duplicate.error ?? restore.error;
  const open = (template: Template) => {
    setFocused(template);
    setSelected(null);
    setMode('preview');
    duplicate.reset();
    restore.reset();
    setName(`${template.name.slice(0, 90)} copy`);
    setLabel('');
  };
  return (
    <>
      <Card>
        <h2>Your template library</h2>
        {pending ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={errorMessage(error)} retry={onRetry} />
        ) : templates.length ? (
          templates.map((template) => (
            <div className="template-row" key={template.id}>
              <span>
                <strong>{template.name}</strong>
                <small>Saved revision {template.revision}</small>
              </span>
              <Button
                variant="secondary"
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  open(template);
                }}
              >
                Versions and preview
              </Button>
            </div>
          ))
        ) : (
          <EmptyState
            title="Your first design belongs here"
            description="Save a draft to create an immutable version in your server’s template library."
          />
        )}
      </Card>
      <Dialog.Root
        open={!!focused}
        onOpenChange={(next) => {
          if (!next) setFocused(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content template-history-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
          >
            <Dialog.Title>{current?.name} · version history</Dialog.Title>
            <Dialog.Description>
              Preview saved designs before opening, copying or restoring them.
              These actions do not post a Discord message.
            </Dialog.Description>
            {versions.isPending ? (
              <LoadingState label="Loading saved versions…" />
            ) : versions.error ? (
              <ErrorState
                message={errorMessage(versions.error)}
                retry={() => void versions.refetch()}
              />
            ) : (
              <div className="template-history-layout">
                <nav aria-label="Saved template versions" className="stack">
                  {versions.data?.map((version) => (
                    <button
                      key={version.id}
                      className={`button button-secondary ${preview?.id === version.id ? 'active' : ''}`}
                      aria-pressed={preview?.id === version.id}
                      onClick={() => {
                        setSelected(version);
                        setMode('preview');
                        duplicate.reset();
                        restore.reset();
                      }}
                    >
                      Version {version.number}
                      {version.label ? ` · ${version.label}` : ''}
                    </button>
                  ))}
                </nav>
                {preview && (
                  <div className="stack">
                    <p>
                      <strong>
                        {preview.label ?? `Version ${preview.number}`}
                      </strong>{' '}
                      · Saved {new Date(preview.createdAt).toLocaleString()}
                    </p>
                    <MessagePreview document={preview.document} />
                    <p className="field-hint">
                      {dirty
                        ? 'Your unsaved editor draft will be kept. Use Return to previous draft to reopen it.'
                        : 'Opening a historical version makes a new local draft. Saving creates a new immutable version.'}
                    </p>
                    <div className="row wrap">
                      <Button
                        onClick={() => {
                          if (current) onOpen(current, preview);
                          setFocused(null);
                        }}
                      >
                        Open version as draft
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setMode('duplicate');
                          duplicate.reset();
                          restore.reset();
                        }}
                      >
                        Duplicate this version
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setMode('restore');
                          duplicate.reset();
                          restore.reset();
                          setLabel(`Restored from version ${preview.number}`);
                        }}
                      >
                        Restore this version
                      </Button>
                    </div>
                    {mode === 'duplicate' && (
                      <div className="card stack">
                        <h3>Copy version {preview.number}</h3>
                        <Field
                          label="New template name"
                          htmlFor="duplicate-template-name"
                        >
                          <Input
                            id="duplicate-template-name"
                            maxLength={100}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                          />
                        </Field>
                        <p>
                          Your current template and editor draft stay available.
                          The copy starts its own saved version history.
                        </p>
                        <Button
                          busy={duplicate.isPending}
                          disabled={!name.trim()}
                          onClick={() => duplicate.mutate()}
                        >
                          Create template copy
                        </Button>
                      </div>
                    )}
                    {mode === 'restore' && (
                      <div className="card stack">
                        <h3>
                          Restore version {preview.number} as a new saved
                          version
                        </h3>
                        <Field
                          label="Restored version name"
                          htmlFor="restore-version-label"
                        >
                          <Input
                            id="restore-version-label"
                            maxLength={100}
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                          />
                        </Field>
                        <p>
                          This creates saved revision{' '}
                          {(current?.revision ?? 0) + 1} from the preview above.
                          Existing versions, live publications and your current
                          editor draft stay available.
                        </p>
                        <Button
                          busy={restore.isPending}
                          onClick={() => restore.mutate()}
                        >
                          Confirm version restore
                        </Button>
                      </div>
                    )}
                    {mutationError && (
                      <ErrorState
                        message={
                          mutationError instanceof ApiError &&
                          mutationError.code === 'REVISION_CONFLICT'
                            ? 'A newer saved version exists. Your preview and editor draft are kept. Refresh history, then review this action again.'
                            : errorMessage(mutationError)
                        }
                        retry={refresh}
                      />
                    )}
                    {duplicate.isSuccess && (
                      <p role="status">
                        Template copy created. Your editor draft has been kept.
                      </p>
                    )}
                    {restore.isSuccess && (
                      <p role="status">
                        Version restored as saved revision{' '}
                        {restore.data.data.number}. Your editor draft has been
                        kept.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <Dialog.Close asChild>
              <Button variant="ghost">Close history</Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
