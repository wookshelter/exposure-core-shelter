# exposure-core

## Local Dev (Graph Data + Web)

### 1) Clone

```bash
git clone <YOUR_REPO_URL>
cd exposure-core-shelter
pnpm install
```

### 2) Create `env.local.sh`

`env.local.sh` is ignored by git (it contains local secrets).

```bash
cp env.example env.local.sh
```

Edit `env.local.sh` and set at least:

- `DUNE_API_KEY` (required for the `resolv` adapter metrics)

### 3) Generate Graph Fixtures (dev)

This writes JSON snapshots under `server/fixtures/output/` and generates
`server/fixtures/output/search-index.json`.

```bash
pnpm graphs:all -- --env ./env.local.sh
```

### 4) Start Web Dev Server

```bash
pnpm dev:web
```

Notes:

- Debank is mocked in local fixture scripts (no paid Debank calls). Dune is real (needs `DUNE_API_KEY`).
- If you skip fixture generation, the web API routes will not find `server/fixtures/output/*`.
