# syntax=docker/dockerfile:1.7
#
# Backend production image (B12.1). Built from the **repository root** as
# context (`docker build -f backend/Dockerfile .`, run from the repository
# root), because this is a pnpm workspace monorepo and the backend depends on
# the `shared` package — `infra/docker-compose.yml` sets `context: .` with
# `--project-directory .` accordingly.
#
# Debian slim, never Alpine: `@node-rs/argon2` and Prisma's generated client
# ship glibc prebuilt binaries, and Alpine's musl libc makes them fail to load
# at runtime rather than at build time (CLAUDE.md, PROJECT_SPEC.md §2.2).
# Node version matches `.nvmrc` (B0.1.3) so the image runs the same runtime a
# developer machine was verified against.

ARG NODE_VERSION=22.23.2

FROM node:${NODE_VERSION}-bookworm-slim AS base
# Prisma's engine postinstall otherwise defaults to guessing an OpenSSL
# version and warns on every install; declaring the real one is what B12.1.2
# asks to verify rather than assume.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
# Created early so both the runtime and migration stages below share one
# definition. A regular (non `--system`) user: `--system` on Debian expects a
# uid under 1000, and a fixed uid/gid the workshop can also chown a bind-mount
# to on the host is the point (B12.1.1), not staying under that ceiling.
RUN groupadd --gid 1001 verkstad \
    && useradd --uid 1001 --gid verkstad --no-create-home --home-dir /repo \
      --shell /usr/sbin/nologin verkstad
WORKDIR /repo

# ---------------------------------------------------------------- dependencies
# `--filter backend...` (the trailing `...` means "and its workspace
# dependencies") installs `shared`'s and `backend`'s own dependencies only —
# not the frontend's Next/React/Tailwind/Playwright tree, which this image
# never runs. pnpm still needs every workspace member's manifest to resolve
# the filter and validate the lockfile, so all three are copied even though
# only two are installed.
#
# `--ignore-scripts` then `pnpm rebuild`: the root package's own `prepare`
# script (`pnpm --filter shared build && ...`) is a *developer* convenience
# for a fresh clone (root README) and fires on every `pnpm install` run from
# `/repo`, including a filtered one — at this point in the build no source has
# been copied yet, so it fails outright. `pnpm rebuild` re-runs each
# dependency's own install/postinstall step (the prebuilt-binary downloads for
# `esbuild`, `@prisma/engines`, `unrs-resolver` — `pnpm-workspace.yaml`'s
# `allowBuilds`) without touching lifecycle scripts on the root project.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# `--filter shared` is explicit, not just pulled in as `backend`'s dependency:
# a transitively-included workspace package only gets its `dependencies`
# installed, not `devDependencies` — and `shared` needs its own `tsup` (its
# build tool) to produce the `dist` the backend then imports.
RUN pnpm install --filter backend... --filter shared --frozen-lockfile --ignore-scripts \
    && pnpm rebuild

# ------------------------------------------------------------------- build
# Prisma client generation (B0.4.3) must run before `tsc`: the generator
# writes TypeScript into `backend/src/generated/prisma`, which the backend
# build step then compiles like any other source file.
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared shared
COPY backend backend
RUN pnpm --filter shared build
RUN pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

# --------------------------------------------------------------- migrations
# A separate job image (B12.3.1, B12.3.3): `docker-compose.yml`'s `migrate`
# service runs this to completion — `prisma migrate deploy` — before the
# `backend` service is allowed to start, never inside the app process on
# boot, where a failed migration would otherwise leave a half-started service
# answering requests against the wrong schema. Built from `build`, not
# `runtime`: the Prisma CLI is a devDependency, deliberately absent from the
# production dependency set, and this stage already has it plus the schema,
# the migrations and `prisma.config.ts` from the full source copy above.
FROM build AS migrate
WORKDIR /repo/backend
ENTRYPOINT ["pnpm", "exec", "prisma"]
CMD ["migrate", "deploy"]

# ------------------------------------------------------------------ runtime
# A second, production-only install rather than pruning the build stage's
# node_modules: `pnpm install --prod` resolves a strictly smaller dependency
# set (no tsx, vitest, testcontainers, typescript, …) from the same lockfile,
# which is simpler to reason about than a prune step and produces the same
# result `pnpm deploy` would, without fighting its "files" packing rules
# against this repository's gitignored `dist/`.
FROM base AS runtime
ENV NODE_ENV=production

# B13.3.5's memory budget is 512 MB, and nothing was enforcing it. V8 sizes its
# old space from the **host's** total RAM when left alone, so under B13.4's
# twenty concurrent users this process plateaued at 583 MiB RSS — stable, not a
# leak, simply a heap with no reason to give pages back. On a single VPS shared
# with Postgres, Caddy and the frontend, that is not a number to discover from
# the OOM killer.
#
# 320 MiB of old space measured at 361 MiB RSS under the same load, with p95
# unchanged — the headroom above the cap is the external memory (sockets,
# buffers, the Prisma client) that no heap flag covers. Re-measure before
# tightening it: too small a cap buys memory with major-GC pauses, which is
# the one trade a latency budget cannot afford.
#
# Set on the image so the image is right on its own. `docker-compose.yml`
# deliberately does not restate the number — but note that a value in a
# developer's `.env` would beat this via `env_file`, exactly as B12 found for
# `NODE_ENV`, so `NODE_OPTIONS` does not belong in `.env`.
ENV NODE_OPTIONS=--max-old-space-size=320
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --filter backend... --frozen-lockfile --prod --ignore-scripts \
    && pnpm rebuild \
    && rm -rf /root/.local/share/pnpm/store /repo/.pnpm-store

COPY --from=build /repo/shared/dist shared/dist
COPY --from=build /repo/backend/dist backend/dist
# Deliberately no `backend/prisma` or `prisma.config.ts` here: the compiled
# client under `dist/generated/prisma` is self-contained, and the schema,
# migrations and CLI belong to the `migrate` stage above, not the running
# app. Keeping them out of this image is what makes "the app cannot run its
# own migrations" true by construction rather than by convention.

# Everything copied above is root-owned but world-readable (the default mode
# `pnpm install`/`COPY` leave files in), which is all a non-root process
# needs from a read-only application tree. Only `./storage` — the one
# directory this process writes to (generated PDFs, §8.3) — is chowned;
# recursively chowning the full dependency tree here was measured at several
# minutes for no behavioural difference.
RUN mkdir -p /repo/backend/storage && chown verkstad:verkstad /repo/backend/storage

USER verkstad
WORKDIR /repo/backend

EXPOSE 3001

# No curl/wget in a slim image on purpose (smaller attack surface); Node's
# built-in fetch does the same check without adding a package.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
