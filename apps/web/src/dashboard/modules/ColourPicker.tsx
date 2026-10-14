import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, Segmented } from '../../ui';
import { CloseButton, useDismiss } from './EditorBits';

/**
 * A colour picker: a saturation and brightness square, a hue bar, and the
 * colour typed as Hex, RGB, HSL or HSB. Discord embed colours are solid, so
 * there's no opacity.
 */
type Hsv = { h: number; s: number; v: number };
type Format = 'hex' | 'rgb' | 'hsl' | 'hsb';

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
const hexOk = (v: string) => /^#?[0-9a-f]{6}$/i.test(v.trim());

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}
const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((x) =>
      Math.round(clamp(x, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  const h = !d
    ? 0
    : max === R
      ? ((G - B) / d + (G < B ? 6 : 0)) * 60
      : max === G
        ? ((B - R) / d + 2) * 60
        : ((R - G) / d + 4) * 60;
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToRgb({ h, s, v }: Hsv) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255] as const;
}
function hsvToHsl({ h, s, v }: Hsv) {
  const l = v * (1 - s / 2);
  return { h, s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l };
}
function hslToHsv(h: number, s: number, l: number): Hsv {
  const v = l + s * Math.min(l, 1 - l);
  return { h, s: v ? 2 * (1 - l / v) : 0, v };
}
const hsvToHex = (c: Hsv) => rgbToHex(...hsvToRgb(c));
const hexToHsv = (hex: string) => rgbToHsv(...hexToRgb(hex));

/** Follows a pointer drag over an element as fractions of its size. */
function useDrag(onMove: (x: number, y: number) => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      el.focus();
      const at = (ev: { clientX: number; clientY: number }) => {
        const r = el.getBoundingClientRect();
        onMove(
          clamp((ev.clientX - r.left) / r.width, 0, 1),
          clamp((ev.clientY - r.top) / r.height, 0, 1),
        );
      };
      at(e);
      const move = (ev: globalThis.PointerEvent) => at(ev);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
  };
}

function Num({
  label,
  value,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="sp-cp__num">
      <span className="sp-cp__num-label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={Math.round(value)}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n, 0, max));
        }}
      />
      {unit && <span className="sp-cp__unit">{unit}</span>}
    </label>
  );
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function ColourPicker({
  value,
  onChange,
  onClose,
  title = 'Colour picker',
}: {
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Hue and saturation are kept here so greys and black don't lose them.
  const [hsv, setHsv] = useState<Hsv>(() =>
    hexOk(value) ? hexToHsv(value) : { h: 48, s: 0.91, v: 0.98 },
  );
  const [format, setFormat] = useState<Format>('hex');
  const [hexText, setHexText] = useState(
    hexOk(value) ? value.toUpperCase() : '#FACC15',
  );
  useDismiss(true, onClose, box);
  const set = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onChange(hex);
  };
  const area = useDrag((x, y) => set({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((_x, y) => set({ ...hsv, h: y * 360 }));
  const keys =
    (step: (dx: number, dy: number) => void) =>
    (e: KeyboardEvent<HTMLElement>) => {
      const by = e.shiftKey ? 10 : 1;
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-by, 0],
        ArrowRight: [by, 0],
        ArrowUp: [0, -by],
        ArrowDown: [0, by],
      };
      const move = d[e.key];
      if (!move) return;
      e.preventDefault();
      step(...move);
    };
  const [r, g, b] = hsvToRgb(hsv);
  const hsl = hsvToHsl(hsv);
  const hex = hsvToHex(hsv);
  const Dropper = (window as unknown as { EyeDropper?: EyeDropperCtor })
    .EyeDropper;

  return (
    <div
      ref={box}
      className="sp-cp"
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="sp-cp__head">
        <h3 className="sp-cp__title">{title}</h3>
        <CloseButton label="Close the colour picker" onClick={onClose} />
      </div>
      <div className="sp-cp__pick">
        <div
          className="sp-cp__area"
          style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
          role="slider"
          tabIndex={0}
          aria-label="Saturation and brightness"
          aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
          {...area}
          onKeyDown={keys((dx, dy) =>
            set({
              ...hsv,
              s: clamp(hsv.s + dx / 100, 0, 1),
              v: clamp(hsv.v - dy / 100, 0, 1),
            }),
          )}
        >
          <span
            className="sp-cp__thumb"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: hex,
            }}
          />
        </div>
        <div
          className="sp-cp__hue"
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          {...hue}
          onKeyDown={keys((_dx, dy) =>
            set({ ...hsv, h: clamp(hsv.h + dy * 3.6, 0, 360) }),
          )}
        >
          <span
            className="sp-cp__thumb"
            style={{
              left: '50%',
              top: `${(hsv.h / 360) * 100}%`,
              backgroundColor: `hsl(${hsv.h} 100% 50%)`,
            }}
          />
        </div>
      </div>
      <Segmented
        label="Colour format"
        className="sp-cp__formats"
        value={format}
        onChange={setFormat}
        options={[
          { value: 'hex', label: 'Hex' },
          { value: 'rgb', label: 'RGB' },
          { value: 'hsl', label: 'HSL' },
          { value: 'hsb', label: 'HSB' },
        ]}
      />
      <div className="sp-cp__row">
        {Dropper && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="pipette"
            aria-label="Pick a colour from the screen"
            onClick={() => {
              new Dropper()
                .open()
                .then(({ sRGBHex }) => {
                  if (hexOk(sRGBHex)) set(hexToHsv(sRGBHex));
                })
                // Pressing Escape cancels the dropper; nothing to do then.
                .catch(() => undefined);
            }}
          />
        )}
        {format === 'hex' ? (
          <label className="sp-cp__num sp-cp__num--hex">
            <span className="sp-cp__unit">#</span>
            <input
              aria-label="Hex colour"
              value={hexText.replace('#', '')}
              maxLength={7}
              spellCheck={false}
              aria-invalid={!hexOk(hexText) || undefined}
              onChange={(e) => {
                const v = `#${e.target.value.replace(/[^0-9a-f]/gi, '')}`;
                setHexText(v.toUpperCase());
                if (hexOk(v)) {
                  setHsv(hexToHsv(v));
                  onChange(v.toUpperCase());
                }
              }}
            />
          </label>
        ) : format === 'rgb' ? (
          (['Red', 'Green', 'Blue'] as const).map((name, i) => (
            <Num
              key={name}
              label={name}
              max={255}
              value={[r, g, b][i]!}
              onChange={(n) => {
                const c = [r, g, b];
                c[i] = n;
                set(rgbToHsv(c[0]!, c[1]!, c[2]!));
              }}
            />
          ))
        ) : format === 'hsl' ? (
          <>
            <Num
              label="Hue"
              max={360}
              value={hsl.h}
              unit="°"
              onChange={(h) => set(hslToHsv(h, hsl.s, hsl.l))}
            />
            <Num
              label="Saturation"
              max={100}
              value={hsl.s * 100}
              unit="%"
              onChange={(s) => set(hslToHsv(hsl.h, s / 100, hsl.l))}
            />
            <Num
              label="Lightness"
              max={100}
              value={hsl.l * 100}
              unit="%"
              onChange={(l) => set(hslToHsv(hsl.h, hsl.s, l / 100))}
            />
          </>
        ) : (
          <>
            <Num
              label="Hue"
              max={360}
              value={hsv.h}
              unit="°"
              onChange={(h) => set({ ...hsv, h })}
            />
            <Num
              label="Saturation"
              max={100}
              value={hsv.s * 100}
              unit="%"
              onChange={(s) => set({ ...hsv, s: s / 100 })}
            />
            <Num
              label="Brightness"
              max={100}
              value={hsv.v * 100}
              unit="%"
              onChange={(v) => set({ ...hsv, v: v / 100 })}
            />
          </>
        )}
      </div>
    </div>
  );
}
