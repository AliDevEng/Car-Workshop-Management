# syntax=docker/dockerfile:1.7
#
# Frontend production image (B12.1). Built from the **repository root** as
# context (`infra/docker-compose.yml` sets `context: .` with
# `--project-directory .`), for the same reason as `backend/Dockerfile`: this
# is a pnpm workspace monorepo and the frontend depends on the `shared`
# package.
#
# Debian slim, matching `backend/Dockerfile` and CLAUDE.md's rule — nothing
# here needs a native binary the way argon2/Prisma do, but one base image
# across both production containers is one fewer thing to keep in sync.

ARG NODE_VERSION=22.23.2

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------- dependencies
# `--filter shared` explicit for the same reason as the backend image: a
# workspace package pulled in only as a dependency gets its `dependencies`
# installed, not the `devDependencies` its own build needs (`tsup`).
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --filter frontend... --filter shared --frozen-lockfile --ignore-scripts \
    && pnpm rebuild

# ------------------------------------------------------------------- build
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared shared
COPY frontend frontend
ENV NODE_ENV=production
# The build reads `INTERNAL_API_URL` from the frontend's own `.env` only as a
# `pnpm dev` convenience (`next.config.ts`); a production build needs no real
# backend to compile against, and the running container gets its actual value
# from `docker-compose.yml`, not from anything baked in here.
RUN pnpm --filter shared build
RUN pnpm --filter frontend build

# ------------------------------------------------------------------ runtime
# `output: 'standalone'` (`next.config.ts`, added for B12.1) traces the
# actual module graph server.js needs and copies just that into
# `.next/standalone` — a far smaller, simpler copy than reinstalling
# production dependencies the way the backend image does, and the mechanism
# Next.js itself recommends for a container image.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# No `corepack enable` here: the standalone server is started with a plain
# `node server.js`, never `pnpm`, so this stage has no use for it.
RUN groupadd --gid 1001 verkstad \
    && useradd --uid 1001 --gid verkstad --no-create-home --home-dir /repo \
      --shell /usr/sbin/nologin verkstad
WORKDIR /repo

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Monorepo tracing nests the app under its workspace path rather than at the
# standalone root — verified against the actual build output below, not
# assumed from Next's single-package docs.
COPY --from=build /repo/frontend/.next/standalone ./
COPY --from=build /repo/frontend/.next/static ./frontend/.next/static
COPY --from=build /repo/frontend/public ./frontend/public

USER verkstad
WORKDIR /repo/frontend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
