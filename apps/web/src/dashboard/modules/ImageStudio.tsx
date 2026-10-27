import { lazy, Suspense, useRef, useState } from 'react';
import {
  AnimatedButton,
  Button,
  EmptyState,
  Icon,
  Input,
  Modal,
  Spinner,
  cx,
  useToast,
} from '../../ui';
import {
  IMAGE_MAX_SIDE,
  IMAGE_MIN_SIDE,
  blankDesign,
  imageSizes,
  pictureDesign,
  useImageActions,
  useStudioActions,
  useStudioImages,
  type Server,
  type StudioImage,
} from '../../data';
import { animIcons } from '../../ui';
import type { OpenImage } from './ImageEditor';

// The editor (and Konva with it) loads only once an image is opened.
const ImageEditor = lazy(() => import('./ImageEditor'));
const editAnim = animIcons.edit.hover;
const cloneAnim = animIcons.clone.hover;
const removeAnim = animIcons.remove.hover;

/** Reads a picture's own size, before the editor has loaded. */
const sizeOf = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('That picture couldn’t be opened.'));
    img.src = url;
  });

function NewImage({
  serverId,
  open,
  onClose,
  onCreate,
}: {
  serverId: string;
  open: boolean;
  onClose: () => void;
  onCreate: (image: OpenImage) => void;
}) {
  const toast = useToast();
  const { upload } = useStudioActions(serverId);
  const [width, setWidth] = useState('1200');
  const [height, setHeight] = useState('630');
  const picker = useRef<HTMLInputElement>(null);
  const side = (v: string) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= IMAGE_MIN_SIDE && n <= IMAGE_MAX_SIDE
      ? n
      : null;
  };
  const w = side(width);
  const h = side(height);
  const sizeError = `${IMAGE_MIN_SIDE} to ${IMAGE_MAX_SIDE}`;

  const fromPicture = async (file: File) => {
    try {
      const url = await upload.mutateAsync(file);
      const size = await sizeOf(url);
      onCreate({
        id: null,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Untitled',
        design: pictureDesign(url, size.width, size.height),
      });
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Couldn’t open the picture',
        body: e instanceof Error ? e.message : 'Try again in a moment.',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="image"
      title="New image"
      description="Pick a size to start from, or upload a picture to edit."
    >
      <div className="sp-img-sizes" role="list">
        {imageSizes.map((s) => (
          <button
            key={s.id}
            type="button"
            role="listitem"
            className="sp-img-size"
            onClick={() =>
              onCreate({
                id: null,
                name: s.label,
                design: blankDesign(s.width, s.height),
              })
            }
          >
            <span
              className="sp-img-size__shape"
              style={{ aspectRatio: `${s.width} / ${s.height}` }}
            />
            <span className="sp-img-size__label">{s.label}</span>
            <span className="sp-hint sp-tnum">
              {s.width} × {s.height}
            </span>
          </button>
        ))}
        <button
          type="button"
          role="listitem"
          className="sp-img-size sp-img-size--upload"
          disabled={upload.isPending}
          onClick={() => picker.current?.click()}
        >
          <span className="sp-img-size__shape">
            {upload.isPending ? <Spinner /> : <Icon name="upload" />}
          </span>
          <span className="sp-img-size__label">Edit a picture</span>
          <span className="sp-hint">PNG, JPEG, GIF or WebP</span>
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        data-testid="new-image-picker"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void fromPicture(file);
        }}
      />
      <div className="sp-img-custom">
        <Input
          label="Width"
          type="number"
          inputMode="numeric"
          suffix="px"
          value={width}
          error={w ? undefined : sizeError}
          onChange={(e) => setWidth(e.target.value)}
        />
        <Input
          label="Height"
          type="number"
          inputMode="numeric"
          suffix="px"
          value={height}
          error={h ? undefined : sizeError}
          onChange={(e) => setHeight(e.target.value)}
        />
        <Button
          variant="primary"
          disabled={!w || !h}
          onClick={() =>
            w &&
            h &&
            onCreate({
              id: null,
              name: 'Untitled',
              design: blankDesign(w, h),
            })
          }
        >
          Custom size
        </Button>
      </div>
    </Modal>
  );
}

export function ImageStudio({ server }: { server: Server }) {
  const images = useStudioImages(server.id);
  const actions = useImageActions(server.id);
  const toast = useToast();
  const [open, setOpen] = useState<OpenImage | null>(null);
  // Bumped to start the editor afresh, when a different image opens.
  const [session, setSession] = useState(0);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<StudioImage | null>(null);
  const paused = !!server.paused;

  const start = (image: OpenImage) => {
    setOpen(image);
    setSession((n) => n + 1);
    setCreating(false);
  };
  const failed = (title: string) => (e: unknown) =>
    toast({
      tone: 'danger',
      title,
      body: e instanceof Error ? e.message : 'Try again in a moment.',
    });

  if (open)
    return (
      <Suspense
        fallback={
          <div className="sp-card sp-img-loading">
            <Spinner /> Opening the editor…
          </div>
        }
      >
        <ImageEditor
          key={session}
          serverId={server.id}
          image={open}
          onBack={() => setOpen(null)}
          // Stays open, now as the saved image.
          onSaved={(saved) => setOpen(saved)}
        />
      </Suspense>
    );

  if (images.isPending)
    return (
      <div className="sp-card sp-img-loading">
        <Spinner /> Loading images…
      </div>
    );
  if (images.isError)
    return (
      <div className="sp-card">
        <EmptyState
          error
          title="Couldn’t load your images"
          actions={
            <Button onClick={() => void images.refetch()}>Try again</Button>
          }
        />
      </div>
    );

  const { limit } = images.data;
  const all = images.data.images;
  const full = all.length >= limit;
  const shown = all.filter((i) =>
    i.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="sp-stack">
      <div className="sp-inbox-bar">
        <p className="sp-hint">
          You have {all.length}/{limit} images.
        </p>
        <div className="sp-img-search">
          <Input
            icon="search"
            aria-label="Search images"
            placeholder="Search images"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <ul className="sp-img-cards" aria-label="Images">
        <li>
          <button
            type="button"
            className="sp-card sp-img-card sp-img-card--new"
            disabled={full || paused}
            onClick={() => setCreating(true)}
          >
            <span className="sp-img-card__plus">
              <Icon name="plus" size="xl" />
            </span>
            <span className="sp-img-card__name">New image</span>
            <span className="sp-hint">
              {full
                ? 'You’ve used every image on this plan.'
                : 'Start from a size or a picture.'}
            </span>
          </button>
        </li>
        {shown.map((i) => (
          <li key={i.id} className="sp-card sp-img-card">
            <button
              type="button"
              className="sp-img-card__thumb"
              aria-label={`Edit ${i.name}`}
              onClick={() =>
                start({ id: i.id, name: i.name, design: i.design })
              }
            >
              {i.url ? (
                <img src={i.url} alt="" loading="lazy" />
              ) : (
                <Icon name="image" size="xl" />
              )}
            </button>
            <div className="sp-img-card__titles">
              <h3 className="sp-img-card__name">{i.name}</h3>
              <p className="sp-hint">
                <span className="sp-tnum">
                  {i.width} × {i.height}
                </span>{' '}
                · {i.meta}
              </p>
            </div>
            <div className={cx('sp-lib-card__actions', 'sp-img-card__actions')}>
              <AnimatedButton
                anim={editAnim}
                variant="ghost"
                size="sm"
                aria-label={`Edit ${i.name}`}
                onClick={() =>
                  start({ id: i.id, name: i.name, design: i.design })
                }
              >
                Edit
              </AnimatedButton>
              <AnimatedButton
                anim={cloneAnim}
                solid
                variant="ghost"
                size="sm"
                disabled={full || actions.clone.isPending}
                aria-label={`Duplicate ${i.name}`}
                onClick={() =>
                  actions.clone.mutate(i.id, {
                    onError: failed('Couldn’t duplicate the image'),
                  })
                }
              >
                Duplicate
              </AnimatedButton>
              {i.url && (
                <a
                  className="sp-btn sp-btn--ghost sp-btn--sm"
                  href={i.url}
                  download={`${i.name}.png`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Download ${i.name}`}
                >
                  <Icon name="download" />
                  Download
                </a>
              )}
              <AnimatedButton
                anim={removeAnim}
                solid
                variant="ghost"
                size="sm"
                aria-label={`Delete ${i.name}`}
                onClick={() => setConfirm(i)}
              >
                Delete
              </AnimatedButton>
            </div>
          </li>
        ))}
      </ul>
      {!shown.length && (
        <p className="sp-hint">
          {all.length
            ? `No images match “${query.trim()}”.`
            : 'No images yet. Press New image to make your first one.'}
        </p>
      )}

      <NewImage
        serverId={server.id}
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={start}
      />
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Delete “${confirm?.name ?? ''}”?`}
        description="Messages that already show it keep their picture. This can’t be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actions.remove.isPending}
              onClick={() =>
                confirm &&
                actions.remove.mutate(confirm.id, {
                  onSuccess: () => {
                    toast({ title: `Deleted “${confirm.name}”` });
                    setConfirm(null);
                  },
                  onError: failed('Couldn’t delete the image'),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
