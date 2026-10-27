import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type Konva from 'konva';
import {
  Ellipse,
  Group,
  Image as KImage,
  Layer,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import {
  Button,
  Icon,
  Input,
  Segmented,
  Select,
  Textarea,
  cx,
  useToast,
} from '../../ui';
import {
  imageFonts,
  imageProblem,
  newLayer,
  useImageActions,
  useStudioActions,
  type ImageBackground,
  type ImageDesign,
  type ImageFill,
  type ImageLayer,
} from '../../data';
import { ColourPicker } from './ColourPicker';
import {
  addLayer,
  duplicateLayer,
  editorReducer,
  fitScale,
  fontCss,
  gradientPoints,
  moveLayer,
  nextLayerId,
  removeLayer,
  startEditor,
  updateLayer,
} from './image-edit';

/** Pictures Discord takes; bigger renders are saved in a smaller format. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Loads a picture for the canvas, shared so it can be drawn and saved. */
function usePicture(url: string, onLoad?: () => void) {
  const [loaded, setLoaded] = useState<{
    url: string;
    img: HTMLImageElement;
  } | null>(null);
  const done = useRef(onLoad);
  useEffect(() => {
    done.current = onLoad;
  });
  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    // Uploads are shared with CORS, so the canvas can still be saved.
    if (!url.startsWith('blob:') && !url.startsWith('data:'))
      img.crossOrigin = 'anonymous';
    img.onload = () => {
      setLoaded({ url, img });
      done.current?.();
    };
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [url]);
  return loaded?.url === url ? loaded.img : null;
}

/** Reads a picture's own size. */
export function pictureSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('That picture couldn’t be opened.'));
    img.src = url;
  });
}

const fillProps = (fill: ImageFill, width: number, height: number) =>
  fill.kind === 'colour'
    ? { fill: fill.colour }
    : (() => {
        const { start, end } = gradientPoints(fill.angle, width, height);
        return {
          fillLinearGradientStartPoint: start,
          fillLinearGradientEndPoint: end,
          fillLinearGradientColorStops: [0, fill.from, 1, fill.to],
        };
      })();

function Background({
  background,
  width,
  height,
  onSelect,
}: {
  background: ImageBackground;
  width: number;
  height: number;
  onSelect: () => void;
}) {
  const img = usePicture(background.kind === 'picture' ? background.url : '');
  // A picture background covers the canvas, cropped to fit.
  const cover = img
    ? (() => {
        const scale = Math.max(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        return { x: (width - w) / 2, y: (height - h) / 2, w, h };
      })()
    : null;
  return (
    <Group
      clipX={0}
      clipY={0}
      clipWidth={width}
      clipHeight={height}
      onMouseDown={onSelect}
      onTouchStart={onSelect}
    >
      <Rect
        width={width}
        height={height}
        {...(background.kind === 'picture'
          ? { fill: background.colour }
          : fillProps(background, width, height))}
      />
      {img && cover && (
        <KImage
          image={img}
          x={cover.x}
          y={cover.y}
          width={cover.w}
          height={cover.h}
        />
      )}
    </Group>
  );
}

function LayerNode({
  layer,
  selected,
  onSelect,
  onChange,
  onPicture,
  register,
}: {
  layer: ImageLayer;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ImageLayer>) => void;
  /** Tells the editor a picture finished loading. */
  onPicture: () => void;
  register: (id: string, node: Konva.Group | null) => void;
}) {
  const img = usePicture(layer.kind === 'picture' ? layer.url : '', onPicture);
  const { width: w, height: h } = layer;
  return (
    <Group
      ref={(node) => register(layer.id, node)}
      name={layer.id}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      opacity={layer.opacity}
      visible={!layer.hidden}
      draggable={!layer.locked}
      onMouseDown={onSelect}
      onTouchStart={onSelect}
      onDragEnd={(e) =>
        onChange({
          x: Math.round(e.target.x()),
          y: Math.round(e.target.y()),
        })
      }
      onTransformEnd={(e) => {
        // The transformer scales the group; that's turned back into a size.
        const node = e.target;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        const patch: Partial<ImageLayer> = {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          rotation: Math.round(node.rotation() * 10) / 10,
          width: Math.max(4, Math.round(w * sx)),
          height: Math.max(4, Math.round(h * sy)),
        };
        if (layer.kind === 'text')
          Object.assign(patch, {
            size: Math.max(1, Math.min(1000, Math.round(layer.size * sy))),
          });
        onChange(patch);
      }}
    >
      {layer.kind === 'text' && (
        <Text
          text={layer.text}
          width={w}
          fontFamily={fontCss(layer.font)}
          fontSize={layer.size}
          fontStyle={
            [layer.italic && 'italic', layer.bold && 'bold']
              .filter(Boolean)
              .join(' ') || 'normal'
          }
          fill={layer.colour}
          align={layer.align}
          lineHeight={layer.lineHeight}
          letterSpacing={layer.letterSpacing}
          stroke={layer.outline}
          strokeWidth={layer.outlineWidth}
          strokeEnabled={layer.outlineWidth > 0}
          fillAfterStrokeEnabled
          onDblClick={() => document.getElementById('img-text')?.focus()}
        />
      )}
      {layer.kind === 'shape' &&
        (layer.shape === 'rect' ? (
          <Rect
            width={w}
            height={h}
            cornerRadius={layer.radius}
            {...fillProps(layer.fill, w, h)}
            stroke={layer.border}
            strokeWidth={layer.borderWidth}
            strokeEnabled={layer.borderWidth > 0}
          />
        ) : (
          <Ellipse
            x={w / 2}
            y={h / 2}
            radiusX={w / 2}
            radiusY={h / 2}
            {...fillProps(layer.fill, w, h)}
            stroke={layer.border}
            strokeWidth={layer.borderWidth}
            strokeEnabled={layer.borderWidth > 0}
          />
        ))}
      {layer.kind === 'picture' &&
        (img ? (
          <KImage
            image={img}
            x={layer.flipX ? w : 0}
            y={layer.flipY ? h : 0}
            scaleX={layer.flipX ? -1 : 1}
            scaleY={layer.flipY ? -1 : 1}
            width={w}
            height={h}
            cornerRadius={layer.radius}
          />
        ) : (
          // Something to grab while the picture loads.
          <Rect width={w} height={h} fill="#99999933" />
        ))}
      {selected && layer.locked && (
        <Rect
          width={w}
          height={h}
          stroke="#5865f2"
          strokeWidth={2}
          dash={[6, 4]}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </Group>
  );
}

/** A colour swatch that opens the colour picker. */
function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sp-field">
      <span className="sp-label">{label}</span>
      <span className="sp-pop-anchor">
        <button
          type="button"
          className="sp-img-swatch"
          aria-label={`${label}: ${value}`}
          aria-expanded={open}
          style={{ '--img-swatch': value } as CSSProperties}
          onClick={() => setOpen(!open)}
        >
          <span />
          {value.toUpperCase()}
        </button>
        {open && (
          <ColourPicker
            title={label}
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        )}
      </span>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (e.target.value === '' || !Number.isFinite(n)) return;
        onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
      }}
    />
  );
}

function FillFields({
  fill,
  onChange,
  label,
}: {
  fill: ImageFill;
  onChange: (fill: ImageFill) => void;
  label: string;
}) {
  return (
    <>
      <Segmented
        label={`${label} type`}
        value={fill.kind}
        onChange={(kind) =>
          onChange(
            kind === 'colour'
              ? {
                  kind: 'colour',
                  colour: fill.kind === 'colour' ? fill.colour : fill.from,
                }
              : {
                  kind: 'gradient',
                  from: fill.kind === 'colour' ? fill.colour : fill.from,
                  to: fill.kind === 'gradient' ? fill.to : '#eb459e',
                  angle: fill.kind === 'gradient' ? fill.angle : 135,
                },
          )
        }
        options={[
          { value: 'colour', label: 'Colour' },
          { value: 'gradient', label: 'Gradient' },
        ]}
      />
      {fill.kind === 'colour' ? (
        <ColourField
          label={label}
          value={fill.colour}
          onChange={(colour) => onChange({ ...fill, colour })}
        />
      ) : (
        <div className="sp-img-pair">
          <ColourField
            label="From"
            value={fill.from}
            onChange={(from) => onChange({ ...fill, from })}
          />
          <ColourField
            label="To"
            value={fill.to}
            onChange={(to) => onChange({ ...fill, to })}
          />
          <NumberField
            label="Angle"
            value={fill.angle}
            min={0}
            max={360}
            onChange={(angle) => onChange({ ...fill, angle })}
          />
        </div>
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sp-card sp-img-panel" aria-label={title}>
      <h3 className="sp-img-panel__title">{title}</h3>
      <div className="sp-img-panel__body">{children}</div>
    </section>
  );
}

/** A square or a circle, for the shape tools and layers. */
function ShapeIcon({ round }: { round: boolean }) {
  return (
    <svg
      className="sp-i sp-i--sm"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {round ? (
        <circle cx="12" cy="12" r="9" />
      ) : (
        <rect x="3" y="3" width="18" height="18" rx="2" />
      )}
    </svg>
  );
}
const layerIcon = (l: ImageLayer) =>
  l.kind === 'text' ? (
    <Icon name="case-upper" size="sm" />
  ) : l.kind === 'picture' ? (
    <Icon name="image" size="sm" />
  ) : (
    <ShapeIcon round={l.shape === 'ellipse'} />
  );

export type OpenImage = {
  /** null until a new image is saved for the first time. */
  id: string | null;
  name: string;
  design: ImageDesign;
};

export function ImageEditor({
  serverId,
  image,
  onBack,
  onSaved,
}: {
  serverId: string;
  image: OpenImage;
  onBack: () => void;
  onSaved: (saved: OpenImage) => void;
}) {
  const toast = useToast();
  const { upload } = useStudioActions(serverId);
  const actions = useImageActions(serverId);
  const [state, dispatch] = useReducer(
    editorReducer,
    image.design,
    startEditor,
  );
  const { design, selected } = state;
  const [name, setName] = useState(image.name);
  const [saving, setSaving] = useState(false);
  // What's saved, to tell whether there are changes.
  const [saved, setSaved] = useState(() =>
    JSON.stringify({ name: image.name, design: image.design }),
  );
  const dirty = JSON.stringify({ name, design }) !== saved;

  const change = (next: ImageDesign, merge?: string) =>
    dispatch({ type: 'change', design: next, ...(merge ? { merge } : {}) });
  const layer = design.layers.find((l) => l.id === selected) ?? null;
  const patch = (p: Partial<ImageLayer>, merge?: string) =>
    layer && change(updateLayer(design, layer.id, p), merge);

  // The canvas fits the space it has.
  const area = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 800, height: 520 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth - 32;
      if (width > 0)
        setSpace({
          width,
          height: Math.max(240, Math.min(window.innerHeight * 0.7, 900)) - 32,
        });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = fitScale(design, space);

  // The transformer follows the selected layer.
  const nodes = useRef(new Map<string, Konva.Group>());
  const transformer = useRef<Konva.Transformer>(null);
  const content = useRef<Konva.Layer>(null);
  const register = (id: string, node: Konva.Group | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
  useEffect(() => {
    const t = transformer.current;
    if (!t) return;
    const node = layer && !layer.locked ? nodes.current.get(layer.id) : null;
    t.nodes(node ? [node] : []);
    t.getLayer()?.batchDraw();
  }, [layer, design]);

  // Pictures still loading, so saving waits for them.
  const [loads, setLoads] = useState(0);
  const pending = design.layers.filter(
    (l) => l.kind === 'picture' && !l.hidden,
  ).length;

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const remove = () => layer && change(removeLayer(design, layer.id));
  const duplicate = () => {
    if (!layer) return;
    const out = duplicateLayer(design, layer.id);
    change(out.design);
    dispatch({ type: 'select', id: out.id });
  };
  const add = (l: ImageLayer) => {
    change(addLayer(design, l));
    dispatch({ type: 'select', id: l.id });
  };

  // Shortcuts, unless someone is typing in a field.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"]') ||
        !area.current?.offsetParent
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && e.key.toLowerCase() === 'd' && layer) {
        e.preventDefault();
        duplicate();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && layer) {
        e.preventDefault();
        remove();
      } else if (e.key === 'Escape') dispatch({ type: 'select', id: null });
      else if (layer && !layer.locked && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy =
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        patch({ x: layer.x + dx, y: layer.y + dy }, `nudge:${layer.id}`);
      }
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const picker = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState<'layer' | 'background'>('layer');
  const choose = (what: 'layer' | 'background') => {
    setPicking(what);
    picker.current?.click();
  };
  const uploaded = async (file: File) => {
    try {
      const url = await upload.mutateAsync(file);
      if (picking === 'background') {
        change({
          ...design,
          background: {
            kind: 'picture',
            url,
            colour:
              design.background.kind === 'colour'
                ? design.background.colour
                : '#ffffff',
          },
        });
        dispatch({ type: 'select', id: null });
        return;
      }
      const size = await pictureSize(url);
      add(newLayer('picture', design, nextLayerId(design), { url, ...size }));
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Couldn’t add the picture',
        body: e instanceof Error ? e.message : 'Try again in a moment.',
      });
    }
  };

  /** Draws the design at its real size, in a format Discord takes. */
  const render = async () => {
    await document.fonts?.ready;
    // Waits a moment for pictures still loading.
    for (let i = 0; i < 50 && loads < pending; i++)
      await new Promise((r) => setTimeout(r, 100));
    const node = content.current;
    if (!node) throw new Error('The canvas isn’t ready yet.');
    const box = {
      x: 0,
      y: 0,
      width: design.width * scale,
      height: design.height * scale,
      pixelRatio: 1 / scale,
    };
    for (const [type, quality, ext] of [
      ['image/png', 1, 'png'],
      ['image/webp', 0.92, 'webp'],
      ['image/jpeg', 0.85, 'jpg'],
    ] as const) {
      const blob = await node.toBlob({ ...box, mimeType: type, quality });
      if (blob && blob.size <= MAX_BYTES && blob.type === type)
        return { blob, ext };
    }
    throw new Error('The image is too detailed to save under 5 MB.');
  };
  const fileName = (ext: string) =>
    `${(name.trim() || 'image').replace(/[^\w -]+/g, '').trim() || 'image'}.${ext}`;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ tone: 'danger', title: 'Give the image a name first' });
      document.getElementById('img-name')?.focus();
      return;
    }
    const problem = imageProblem(design, { blob: true });
    if (problem) {
      toast({ tone: 'danger', title: 'Can’t save yet', body: problem });
      return;
    }
    setSaving(true);
    dispatch({ type: 'select', id: null });
    try {
      const { blob, ext } = await render();
      const url = await upload.mutateAsync(
        new File([blob], fileName(ext), { type: blob.type }),
      );
      let id = image.id;
      if (id)
        await actions.update.mutateAsync({ id, name: trimmed, design, url });
      else
        ({ id } = await actions.save.mutateAsync({
          name: trimmed,
          design,
          url,
        }));
      setName(trimmed);
      setSaved(JSON.stringify({ name: trimmed, design }));
      onSaved({ id, name: trimmed, design });
      toast({ tone: 'success', title: `Saved “${trimmed}”` });
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Couldn’t save the image',
        body: e instanceof Error ? e.message : 'Try again in a moment.',
      });
    } finally {
      setSaving(false);
    }
  };
  const download = async () => {
    dispatch({ type: 'select', id: null });
    try {
      const { blob, ext } = await render();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName(ext);
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Couldn’t download the image',
        body: e instanceof Error ? e.message : 'Try again in a moment.',
      });
    }
  };

  const bg = design.background;
  const index = layer ? design.layers.indexOf(layer) : -1;

  return (
    <div className="sp-img-editor">
      <div className="sp-img-bar">
        <Button
          variant="ghost"
          size="sm"
          icon="arrow-left"
          onClick={() => {
            if (
              dirty &&
              !window.confirm(
                'Leave without saving? Your changes will be lost.',
              )
            )
              return;
            onBack();
          }}
        >
          All images
        </Button>
        <div className="sp-img-bar__name">
          <Input
            id="img-name"
            aria-label="Image name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <span className="sp-hint sp-tnum">
          {design.width} × {design.height}
        </span>
        <div className="sp-img-bar__actions">
          <Button
            variant="ghost"
            size="sm"
            icon="undo-2"
            iconOnly
            aria-label="Undo"
            disabled={!state.past.length}
            onClick={() => dispatch({ type: 'undo' })}
          />
          <Button
            variant="ghost"
            size="sm"
            icon="undo-2"
            iconOnly
            className="sp-img-redo"
            aria-label="Redo"
            disabled={!state.future.length}
            onClick={() => dispatch({ type: 'redo' })}
          />
          <Button size="sm" icon="download" onClick={() => void download()}>
            Download
          </Button>
          <Button
            size="sm"
            variant={dirty || !image.id ? 'primary' : 'secondary'}
            icon="save"
            loading={saving}
            loadingLabel="Saving…"
            disabled={saving || (!dirty && !!image.id)}
            onClick={() => void save()}
          >
            Save image
          </Button>
        </div>
      </div>

      <div className="sp-img-grid">
        <div
          className="sp-img-tools"
          role="toolbar"
          aria-label="Add to the image"
        >
          {(
            [
              ['text', <Icon key="i" name="case-upper" />, 'Text'],
              ['rect', <ShapeIcon key="i" round={false} />, 'Rectangle'],
              ['ellipse', <ShapeIcon key="i" round />, 'Circle'],
            ] as const
          ).map(([kind, icon, label]) => (
            <button
              key={kind}
              type="button"
              className="sp-img-tool"
              disabled={design.layers.length >= 100}
              onClick={() => add(newLayer(kind, design, nextLayerId(design)))}
            >
              {icon}
              {label}
            </button>
          ))}
          <button
            type="button"
            className="sp-img-tool"
            disabled={upload.isPending || design.layers.length >= 100}
            onClick={() => choose('layer')}
          >
            <Icon name="image" />
            Picture
          </button>
          <button
            type="button"
            className={cx('sp-img-tool', !layer && 'is-active')}
            onClick={() => dispatch({ type: 'select', id: null })}
          >
            <Icon name="palette" />
            Background
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            data-testid="img-picker"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploaded(file);
            }}
          />
        </div>

        <div ref={area} className="sp-img-canvas">
          <div
            className="sp-img-stage"
            style={{
              width: design.width * scale,
              height: design.height * scale,
            }}
          >
            <Stage
              width={design.width * scale}
              height={design.height * scale}
              scaleX={scale}
              scaleY={scale}
            >
              <Layer ref={content}>
                <Background
                  background={bg}
                  width={design.width}
                  height={design.height}
                  onSelect={() => dispatch({ type: 'select', id: null })}
                />
                {design.layers.map((l) => (
                  <LayerNode
                    key={l.id}
                    layer={l}
                    selected={l.id === selected}
                    register={register}
                    onPicture={() => setLoads((n) => n + 1)}
                    onSelect={() => dispatch({ type: 'select', id: l.id })}
                    onChange={(p) => change(updateLayer(design, l.id, p))}
                  />
                ))}
              </Layer>
              <Layer>
                <Transformer
                  ref={transformer}
                  rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                  borderStroke="#5865f2"
                  anchorStroke="#5865f2"
                  anchorCornerRadius={3}
                  ignoreStroke
                  keepRatio={layer?.kind === 'picture'}
                  boundBoxFunc={(old, next) =>
                    Math.abs(next.width) < 4 || Math.abs(next.height) < 4
                      ? old
                      : next
                  }
                />
              </Layer>
            </Stage>
          </div>
        </div>

        <div className="sp-stack sp-img-side">
          {layer ? (
            <Panel title={layer.name}>
              <Input
                label="Layer name"
                maxLength={80}
                value={layer.name}
                onChange={(e) =>
                  patch({ name: e.target.value }, `name:${layer.id}`)
                }
              />
              {layer.kind === 'text' && (
                <>
                  <Textarea
                    id="img-text"
                    label="Text"
                    rows={3}
                    maxLength={2000}
                    value={layer.text}
                    onChange={(e) =>
                      patch({ text: e.target.value }, `text:${layer.id}`)
                    }
                  />
                  <Select
                    label="Font"
                    value={layer.font}
                    options={[...imageFonts]}
                    onChange={(e) => patch({ font: e.target.value })}
                  />
                  <div className="sp-img-pair">
                    <NumberField
                      label="Size"
                      value={layer.size}
                      min={1}
                      max={1000}
                      onChange={(size) => patch({ size }, `size:${layer.id}`)}
                    />
                    <ColourField
                      label="Colour"
                      value={layer.colour}
                      onChange={(colour) =>
                        patch({ colour }, `colour:${layer.id}`)
                      }
                    />
                  </div>
                  <div className="sp-img-row">
                    <Button
                      size="sm"
                      variant={layer.bold ? 'primary' : 'secondary'}
                      aria-pressed={layer.bold}
                      onClick={() => patch({ bold: !layer.bold })}
                    >
                      Bold
                    </Button>
                    <Button
                      size="sm"
                      variant={layer.italic ? 'primary' : 'secondary'}
                      aria-pressed={layer.italic}
                      onClick={() => patch({ italic: !layer.italic })}
                    >
                      Italic
                    </Button>
                  </div>
                  <Segmented
                    label="Alignment"
                    value={layer.align}
                    onChange={(align) => patch({ align })}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Centre' },
                      { value: 'right', label: 'Right' },
                    ]}
                  />
                  <div className="sp-img-pair">
                    <NumberField
                      label="Line height"
                      value={layer.lineHeight}
                      min={0.5}
                      max={4}
                      step={0.1}
                      onChange={(lineHeight) =>
                        patch({ lineHeight }, `lh:${layer.id}`)
                      }
                    />
                    <NumberField
                      label="Letter spacing"
                      value={layer.letterSpacing}
                      min={-50}
                      max={200}
                      onChange={(letterSpacing) =>
                        patch({ letterSpacing }, `ls:${layer.id}`)
                      }
                    />
                  </div>
                  <div className="sp-img-pair">
                    <NumberField
                      label="Outline"
                      value={layer.outlineWidth}
                      min={0}
                      max={50}
                      onChange={(outlineWidth) =>
                        patch({ outlineWidth }, `ow:${layer.id}`)
                      }
                    />
                    <ColourField
                      label="Outline colour"
                      value={layer.outline}
                      onChange={(outline) =>
                        patch({ outline }, `oc:${layer.id}`)
                      }
                    />
                  </div>
                </>
              )}
              {layer.kind === 'shape' && (
                <>
                  <FillFields
                    label="Fill"
                    fill={layer.fill}
                    onChange={(fill) => patch({ fill }, `fill:${layer.id}`)}
                  />
                  <div className="sp-img-pair">
                    <NumberField
                      label="Border"
                      value={layer.borderWidth}
                      min={0}
                      max={200}
                      onChange={(borderWidth) =>
                        patch({ borderWidth }, `bw:${layer.id}`)
                      }
                    />
                    <ColourField
                      label="Border colour"
                      value={layer.border}
                      onChange={(border) => patch({ border }, `bc:${layer.id}`)}
                    />
                  </div>
                  {layer.shape === 'rect' && (
                    <NumberField
                      label="Rounded corners"
                      value={layer.radius}
                      min={0}
                      max={1000}
                      onChange={(radius) => patch({ radius }, `r:${layer.id}`)}
                    />
                  )}
                </>
              )}
              {layer.kind === 'picture' && (
                <>
                  <NumberField
                    label="Rounded corners"
                    value={layer.radius}
                    min={0}
                    max={1000}
                    onChange={(radius) => patch({ radius }, `r:${layer.id}`)}
                  />
                  <div className="sp-img-row">
                    <Button
                      size="sm"
                      aria-pressed={layer.flipX}
                      onClick={() => patch({ flipX: !layer.flipX })}
                    >
                      Flip across
                    </Button>
                    <Button
                      size="sm"
                      aria-pressed={layer.flipY}
                      onClick={() => patch({ flipY: !layer.flipY })}
                    >
                      Flip up and down
                    </Button>
                  </div>
                </>
              )}
              <div className="sp-img-pair">
                <NumberField
                  label="X"
                  value={layer.x}
                  onChange={(x) => patch({ x }, `x:${layer.id}`)}
                />
                <NumberField
                  label="Y"
                  value={layer.y}
                  onChange={(y) => patch({ y }, `y:${layer.id}`)}
                />
                <NumberField
                  label="Width"
                  value={layer.width}
                  min={1}
                  onChange={(width) => patch({ width }, `w:${layer.id}`)}
                />
                <NumberField
                  label="Height"
                  value={layer.height}
                  min={1}
                  onChange={(height) => patch({ height }, `h:${layer.id}`)}
                />
                <NumberField
                  label="Rotation"
                  value={layer.rotation}
                  min={-360}
                  max={360}
                  onChange={(rotation) =>
                    patch({ rotation }, `rot:${layer.id}`)
                  }
                />
                <NumberField
                  label="Opacity %"
                  value={Math.round(layer.opacity * 100)}
                  min={0}
                  max={100}
                  onChange={(o) =>
                    patch({ opacity: o / 100 }, `op:${layer.id}`)
                  }
                />
              </div>
              <div className="sp-img-row">
                <Button
                  size="sm"
                  icon="arrow-up"
                  disabled={index === design.layers.length - 1}
                  onClick={() => change(moveLayer(design, layer.id, 'up'))}
                >
                  Forward
                </Button>
                <Button
                  size="sm"
                  icon="arrow-down"
                  disabled={index === 0}
                  onClick={() => change(moveLayer(design, layer.id, 'down'))}
                >
                  Backward
                </Button>
                <Button size="sm" icon="copy" onClick={duplicate}>
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  icon="lock"
                  aria-pressed={layer.locked}
                  onClick={() => patch({ locked: !layer.locked })}
                >
                  {layer.locked ? 'Unlock' : 'Lock'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon="trash-2"
                  onClick={remove}
                >
                  Delete
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel title="Background">
              <Segmented
                label="Background type"
                value={bg.kind}
                onChange={(kind) => {
                  if (kind === 'picture') return choose('background');
                  const colour =
                    bg.kind === 'colour'
                      ? bg.colour
                      : bg.kind === 'gradient'
                        ? bg.from
                        : bg.colour;
                  change({
                    ...design,
                    background:
                      kind === 'colour'
                        ? { kind, colour }
                        : { kind, from: colour, to: '#eb459e', angle: 135 },
                  });
                }}
                options={[
                  { value: 'colour', label: 'Colour' },
                  { value: 'gradient', label: 'Gradient' },
                  { value: 'picture', label: 'Picture' },
                ]}
              />
              {bg.kind === 'colour' && (
                <ColourField
                  label="Colour"
                  value={bg.colour}
                  onChange={(colour) =>
                    change({ ...design, background: { ...bg, colour } }, 'bg')
                  }
                />
              )}
              {bg.kind === 'gradient' && (
                <div className="sp-img-pair">
                  <ColourField
                    label="From"
                    value={bg.from}
                    onChange={(from) =>
                      change({ ...design, background: { ...bg, from } }, 'bg')
                    }
                  />
                  <ColourField
                    label="To"
                    value={bg.to}
                    onChange={(to) =>
                      change({ ...design, background: { ...bg, to } }, 'bg')
                    }
                  />
                  <NumberField
                    label="Angle"
                    value={bg.angle}
                    min={0}
                    max={360}
                    onChange={(angle) =>
                      change({ ...design, background: { ...bg, angle } }, 'bg')
                    }
                  />
                </div>
              )}
              {bg.kind === 'picture' && (
                <Button
                  size="sm"
                  icon="upload"
                  loading={upload.isPending}
                  onClick={() => choose('background')}
                >
                  Change picture
                </Button>
              )}
              <p className="sp-hint">
                Click a layer on the canvas to change it. Delete removes it,
                arrow keys nudge it, and Ctrl+Z undoes.
              </p>
            </Panel>
          )}

          <Panel title="Layers">
            {design.layers.length ? (
              <ol className="sp-img-layers" reversed>
                {[...design.layers].reverse().map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={cx(
                        'sp-img-layer',
                        l.id === selected && 'is-selected',
                        l.hidden && 'is-hidden',
                      )}
                      aria-pressed={l.id === selected}
                      onClick={() => dispatch({ type: 'select', id: l.id })}
                    >
                      {layerIcon(l)}
                      <span>{l.name}</span>
                      {l.locked && <Icon name="lock" size="xs" />}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon="eye"
                      className={cx(l.hidden && 'is-off')}
                      aria-label={`${l.hidden ? 'Show' : 'Hide'} ${l.name}`}
                      aria-pressed={!l.hidden}
                      onClick={() =>
                        change(updateLayer(design, l.id, { hidden: !l.hidden }))
                      }
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sp-hint">
                Nothing here yet. Add text, a shape or a picture.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default ImageEditor;
