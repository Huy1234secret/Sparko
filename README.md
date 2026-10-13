# Sparko

The all-in-one Discord bot that explains itself, and its website.

- `design-system/`: the Sparko design system (tokens, components, UI kits).
- `apps/web/`: the website, built with React and Vite from the design system.
- `apps/server/`: serves the built website in production.
- `apps/bot/`: the Discord bot. For now it only comes online and answers `/ping` while the rest is rebuilt.

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test
pnpm build
pm2 start ecosystem.config.cjs   # website and bot, as on the server
```

Node 24 and pnpm 11 are required. See `docs/frontend.md` for how the rebuild is organised and `docs/hosting.md` for running it on the server with pm2.
