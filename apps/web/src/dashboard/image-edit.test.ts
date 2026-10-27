import { describe, expect, it } from 'vitest';
import { blankDesign, newLayer } from '../data/studio-format';
import {
  addLayer,
  duplicateLayer,
  editorReducer,
  fitScale,
  gradientPoints,
  moveLayer,
  nextLayerId,
  startEditor,
  updateLayer,
} from './modules/image-edit';

const base = () => {
  const d = blankDesign(400, 200);
  return addLayer(
    addLayer(d, newLayer('text', d, 'l1')),
    newLayer('rect', d, 'l2'),
  );
};

describe('Image studio editor', () => {
  it('undoes and redoes, with typing undone in one step', () => {
    let s = startEditor(base());
    s = editorReducer(s, { type: 'select', id: 'l1' });
    for (const text of ['H', 'Hi', 'Hi!'])
      s = editorReducer(s, {
        type: 'change',
        design: updateLayer(s.design, 'l1', { text }),
        merge: 'text:l1',
      });
    s = editorReducer(s, {
      type: 'change',
      design: updateLayer(s.design, 'l1', { x: 5 }),
    });
    expect(s.past).toHaveLength(2);
    s = editorReducer(s, { type: 'undo' });
    expect(s.design.layers[0]).toMatchObject({ text: 'Hi!', x: 120 });
    s = editorReducer(s, { type: 'undo' });
    expect(s.design.layers[0]).toMatchObject({ text: 'Your text' });
    expect(s.selected).toBe('l1');
    s = editorReducer(s, { type: 'redo' });
    expect(s.design.layers[0]).toMatchObject({ text: 'Hi!' });
    // A new change clears what Redo had.
    s = editorReducer(s, {
      type: 'change',
      design: updateLayer(s.design, 'l1', { y: 1 }),
    });
    expect(s.future).toEqual([]);
  });

  it('drops the selection when the layer goes', () => {
    let s = editorReducer(startEditor(base()), { type: 'select', id: 'l2' });
    s = editorReducer(s, {
      type: 'change',
      design: { ...s.design, layers: s.design.layers.slice(0, 1) },
    });
    expect(s.selected).toBeNull();
  });

  it('duplicates, orders and names layers', () => {
    const d = base();
    expect(nextLayerId(d)).toBe('l3');
    const { design, id } = duplicateLayer(d, 'l1');
    expect(design.layers.map((l) => l.id)).toEqual(['l1', id, 'l2']);
    expect(design.layers[1]).toMatchObject({ name: 'Text copy', x: 140 });
    expect(moveLayer(d, 'l1', 'up').layers.map((l) => l.id)).toEqual([
      'l2',
      'l1',
    ]);
    expect(moveLayer(d, 'l2', 'back').layers.map((l) => l.id)).toEqual([
      'l2',
      'l1',
    ]);
    expect(moveLayer(d, 'l2', 'up')).toEqual(d);
  });

  it('runs gradients like CSS and fits the canvas to its space', () => {
    expect(gradientPoints(90, 100, 50)).toEqual({
      start: { x: 0, y: 25 },
      end: { x: 100, y: 25 },
    });
    const down = gradientPoints(180, 100, 50);
    expect(down.start.y).toBeCloseTo(0);
    expect(down.end.y).toBeCloseTo(50);
    expect(
      fitScale({ width: 2000, height: 1000 }, { width: 500, height: 900 }),
    ).toBe(0.25);
    expect(
      fitScale({ width: 100, height: 100 }, { width: 500, height: 500 }),
    ).toBe(1);
  });
});
