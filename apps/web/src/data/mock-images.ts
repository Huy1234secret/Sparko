import type { ImagesState, PanelApi, Server, StudioImage } from './types';
import {
  blankDesign,
  imageProblem,
  newLayer,
  type ImageDesign,
  type TextLayer,
} from './studio-format';

type Helpers = {
  wait: <T>(value: T) => Promise<T>;
  copy: <T>(value: T) => T;
  server: (id: string) => Server;
};

type Api = Pick<
  PanelApi,
  'getImages' | 'saveImage' | 'updateImage' | 'cloneImage' | 'deleteImage'
>;

/** The sample images' pictures, drawn as SVG so they work offline. */
const svg = (w: number, h: number, body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`;

function sampleImages(): StudioImage[] {
  const banner: ImageDesign = {
    ...blankDesign(960, 540),
    background: {
      kind: 'gradient',
      from: '#5865f2',
      to: '#eb459e',
      angle: 135,
    },
  };
  const title: TextLayer = {
    ...(newLayer('text', banner, 'l1') as TextLayer),
    text: 'Pixel Plaza',
    colour: '#ffffff',
    size: 96,
    y: 200,
    height: 116,
    width: 800,
    x: 80,
  };
  banner.layers.push(title);
  const card: ImageDesign = {
    ...blankDesign(1024, 500),
    background: { kind: 'colour', colour: '#111827' },
  };
  card.layers.push(
    { ...newLayer('ellipse', card, 'l1'), name: 'Circle' },
    {
      ...(newLayer('text', card, 'l2') as TextLayer),
      text: 'Welcome!',
      colour: '#facc15',
      y: 380,
      height: 60,
    },
  );
  return [
    {
      id: 'img1',
      name: 'Server banner',
      width: 960,
      height: 540,
      url: svg(
        960,
        540,
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5865f2"/><stop offset="1" stop-color="#eb459e"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><text x="480" y="290" font-family="Inter, sans-serif" font-size="96" font-weight="700" text-anchor="middle" fill="#fff">Pixel Plaza</text>',
      ),
      meta: 'Saved 2 h ago by Rhea',
      design: banner,
    },
    {
      id: 'img2',
      name: 'Welcome card',
      width: 1024,
      height: 500,
      url: svg(
        1024,
        500,
        '<rect width="1024" height="500" fill="#111827"/><circle cx="512" cy="250" r="83" fill="#5865f2"/><text x="512" y="425" font-family="Inter, sans-serif" font-size="50" font-weight="700" text-anchor="middle" fill="#facc15">Welcome!</text>',
      ),
      meta: 'Saved yesterday by you',
      design: card,
    },
  ];
}

export function createImagesMock(h: Helpers) {
  const state = new Map<string, StudioImage[]>();
  const of = (serverId: string) => {
    let list = state.get(serverId);
    if (!list) {
      list = sampleImages();
      state.set(serverId, list);
    }
    return list;
  };
  const limit = (serverId: string) =>
    h.server(serverId).plan === 'plus' ? 200 : 25;
  let next = 100;
  const key = (name: string) => name.trim().toLowerCase();
  const unique = (list: StudioImage[], name: string) => {
    const taken = new Set(list.map((i) => key(i.name)));
    if (!taken.has(key(name))) return name;
    for (let n = 2; ; n++) {
      const suffix = ` (x${n})`;
      const out = name.slice(0, 80 - suffix.length) + suffix;
      if (!taken.has(key(out))) return out;
    }
  };
  const check = (design: ImageDesign) => {
    const problem = imageProblem(design, { blob: true });
    if (problem) throw new Error(problem);
  };
  const find = (serverId: string, id: string) => {
    const image = of(serverId).find((i) => i.id === id);
    if (!image) throw new Error('That image no longer exists.');
    return image;
  };

  const api: Api = {
    async getImages(serverId) {
      const out: ImagesState = {
        images: h.copy(of(serverId)),
        limit: limit(serverId),
      };
      return h.wait(out);
    },
    async saveImage(serverId, { name, design, url }) {
      const list = of(serverId);
      if (list.length >= limit(serverId))
        throw new Error('You’ve used every image on this plan.');
      check(design);
      const image: StudioImage = {
        id: `img${next++}`,
        name: unique(list, name),
        width: design.width,
        height: design.height,
        url,
        meta: 'Saved just now by you',
        design: h.copy(design),
      };
      list.unshift(image);
      return h.wait({ id: image.id });
    },
    async updateImage(serverId, id, change) {
      const list = of(serverId);
      const image = find(serverId, id);
      if (
        change.name !== undefined &&
        list.some((i) => i.id !== id && key(i.name) === key(change.name!))
      )
        throw new Error(
          `An image named “${change.name.trim()}” already exists. Pick another name.`,
        );
      if (change.design) check(change.design);
      Object.assign(image, {
        ...(change.name === undefined ? {} : { name: change.name.trim() }),
        ...(change.design
          ? {
              design: h.copy(change.design),
              width: change.design.width,
              height: change.design.height,
            }
          : {}),
        ...(change.url === undefined ? {} : { url: change.url }),
        meta: 'Saved just now by you',
      });
      // The newest change comes first, like on the server.
      list.splice(list.indexOf(image), 1);
      list.unshift(image);
      return h.wait(undefined);
    },
    async cloneImage(serverId, id) {
      const list = of(serverId);
      if (list.length >= limit(serverId))
        throw new Error('You’ve used every image on this plan.');
      const image = find(serverId, id);
      list.unshift({
        ...h.copy(image),
        id: `img${next++}`,
        name: unique(list, `${image.name} (copy)`.slice(0, 80)),
        meta: 'Saved just now by you',
      });
      return h.wait(undefined);
    },
    async deleteImage(serverId, id) {
      state.set(
        serverId,
        of(serverId).filter((i) => i.id !== id),
      );
      return h.wait(undefined);
    },
  };
  return { api, reset: () => state.clear() };
}
