import { useRef, useState } from 'react';
import { Icon, cx, useToast } from '../../ui';
import {
  fromDiscord,
  jsonErrorLine,
  studioPayload,
  type StudioMessage,
} from '../../data';
import { AnimatedIconButton, InfoTip, uploadAnimations } from './EditorBits';
import cloneReveal from '../../../../../design-system/assets/icons/animated-icons/clone-button-reveal.json?url';
import cloneHover from '../../../../../design-system/assets/icons/animated-icons/clone-button-hover.json?url';
import downloadReveal from '../../../../../design-system/assets/icons/animated-icons/download-button-reveal.json?url';
import downloadHover from '../../../../../design-system/assets/icons/animated-icons/download-button-hover.json?url';
import downloadSelect from '../../../../../design-system/assets/icons/animated-icons/download-button-select.json?url';

export const jsonAnimations = [
  downloadReveal,
  downloadHover,
  downloadSelect,
  cloneReveal,
  cloneHover,
];

/** One line of the editor, in pixels; the red bar for a bad line uses it. */
const LINE = 18;
const PAD = 12;

type JsonError = { text: string; line: number | null };

/**
 * The message as Discord JSON: exactly what Sparko sends, with {variables}
 * as written. It can be edited in place, imported from a file or exported
 * to one; JSON that doesn't read turns the box red and marks the line.
 */
export function JsonPanel({
  message,
  onChange,
}: {
  message: StudioMessage;
  onChange: (next: StudioMessage) => void;
}) {
  const toast = useToast();
  const generated = JSON.stringify(
    studioPayload(message, { now: 0, raw: true }),
    null,
    2,
  );
  // What's being typed; the generated JSON shows again once it reads.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<JsonError | null>(null);
  const [scroll, setScroll] = useState(0);
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const shown = draft ?? generated;
  const lines = shown.split('\n').length;

  /** Reads JSON into the message; says what's wrong if it can't. */
  const read = (source: string): JsonError | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch (e) {
      const line = jsonErrorLine(source, e);
      return {
        text: line
          ? `Line ${line} isn’t valid JSON. Check for a missing comma, quote or bracket.`
          : 'That isn’t valid JSON. Check for a missing comma, quote or bracket.',
        line,
      };
    }
    const result = fromDiscord(parsed, message);
    if ('problem' in result) return { text: result.problem, line: null };
    onChange(result.message);
    return null;
  };

  const edit = (source: string) => {
    setDraft(source);
    setError(read(source));
  };

  const importFile = async (f: File) => {
    const source = await f.text();
    const problem = read(source);
    setError(problem);
    setDraft(problem ? source : null);
    toast(
      problem
        ? {
            tone: 'danger',
            title: 'Couldn’t import that file',
            body: problem.text,
          }
        : { tone: 'success', title: `Imported ${f.name}` },
    );
  };

  const exportFile = () => {
    const name = (message.name.trim() || 'message').replace(/[^\w-]+/g, '-');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([generated], { type: 'application/json' }),
    );
    link.download = `${name}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };

  return (
    <div className="sp-field">
      <div className="sp-field__row sp-json-head">
        <span className="sp-label" id="studio-json">
          Discord JSON{' '}
          <InfoTip text="Exactly what Sparko sends to Discord for this message. Edit it here or import a file, and the message changes to match. Export saves it as a file." />
        </span>
        <span className="sp-json-head__tools">
          <AnimatedIconButton
            size="sm"
            variant="ghost"
            reveal={uploadAnimations.reveal}
            hover={uploadAnimations.hover}
            select={uploadAnimations.select}
            onClick={() => file.current?.click()}
          >
            Import
          </AnimatedIconButton>
          <AnimatedIconButton
            size="sm"
            variant="ghost"
            reveal={downloadReveal}
            hover={downloadHover}
            select={downloadSelect}
            onClick={exportFile}
          >
            Export
          </AnimatedIconButton>
          <AnimatedIconButton
            size="sm"
            variant="ghost"
            reveal={cloneReveal}
            hover={cloneHover}
            select={cloneHover}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(shown)
                .then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </AnimatedIconButton>
        </span>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="JSON file to import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
      </div>
      <div className={cx('sp-code', !!error && 'is-error')}>
        <div
          className="sp-code__gutter"
          aria-hidden="true"
          style={{ transform: `translateY(${-scroll}px)` }}
        >
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} className={cx(error?.line === i + 1 && 'is-bad')}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className="sp-code__main">
          {error?.line && (
            <div
              className="sp-code__bad"
              aria-hidden="true"
              style={{ top: PAD + (error.line - 1) * LINE - scroll }}
            />
          )}
          <textarea
            className="sp-code__text"
            aria-labelledby="studio-json"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'studio-json-error' : undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            value={shown}
            onChange={(e) => edit(e.target.value)}
            onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
            onBlur={() => {
              if (!error) setDraft(null);
            }}
          />
        </div>
      </div>
      {error && (
        <p className="sp-field-error" id="studio-json-error" role="alert">
          <Icon name="circle-alert" />
          {error.text}
        </p>
      )}
    </div>
  );
}
