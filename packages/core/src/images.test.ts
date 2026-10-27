import { describe, expect, it } from 'vitest';
import {
  blankDesign,
  cleanDesign,
  imageProblem,
  newLayer,
  pictureDesign,
  type ImageDesign,
} from './images.ts';

const design = (): ImageDesign => {
  const d = blankDesign(1200, 630);
  d.layers.push(
    newLayer('text', d, 'l1'),
    newLayer('rect', d, 'l2'),
    newLayer('picture', d, 'l3', {
      url: 'https://panel.example/media/1-a.png',
      width: 2400,
      height: 1200,
    }),
  );
  return d;
};

describe('Image studio designs', () => {
  it('places new layers in the middle, pictures kept in shape', () => {
    const d = design();
    expect(imageProblem(d)).toBeNull();
    const pic = d.layers[2]!;
    // Two thirds of the canvas at most, at the picture's own shape.
    expect(pic).toMatchObject({ width: 800, height: 400, x: 200, y: 115 });
  });

  it('starts an edited picture at its own size, scaled down when huge', () => {
    const d = pictureDesign('https://x.example/a.png', 4096, 1024);
    expect(d).toMatchObject({ width: 2048, height: 512 });
    expect(d.layers[0]).toMatchObject({ x: 0, y: 0, width: 2048 });
  });

  it('refuses designs that can’t be saved', () => {
    expect(imageProblem(null)).toBe('The image is missing.');
    expect(imageProblem({ ...design(), width: 4000 })).toContain('16 to 2048');
    const bad = design();
    bad.background = { kind: 'colour', colour: 'red' };
    expect(imageProblem(bad)).toBe('The background colour isn’t valid.');
    const dupe = design();
    dupe.layers[1] = { ...dupe.layers[1]!, id: 'l1' };
    expect(imageProblem(dupe)).toBe('A layer isn’t valid.');
    const big = design();
    big.layers = Array.from({ length: 101 }, (_, i) =>
      newLayer('rect', big, `l${i}`),
    );
    expect(imageProblem(big)).toContain('up to 100 layers');
    const text = design();
    text.layers[0] = { ...text.layers[0]!, text: 'x'.repeat(2001) } as never;
    expect(imageProblem(text)).toContain('2000 characters');
  });

  it('allows blob: pictures only in the dashboard’s sample data', () => {
    const d = pictureDesign('blob:http://localhost/123', 100, 100);
    expect(imageProblem(d)).toBe('Picture’s link isn’t valid.');
    expect(imageProblem(d, { blob: true })).toBeNull();
  });

  it('keeps only the fields a design has', () => {
    const d = design();
    const messy = {
      ...d,
      extra: 1,
      layers: d.layers.map((l) => ({ ...l, sneaky: true })),
    } as ImageDesign;
    const clean = cleanDesign(messy);
    expect(clean).toEqual(d);
    expect(clean).not.toHaveProperty('extra');
  });
});
