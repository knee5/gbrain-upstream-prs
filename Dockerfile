# Multi-stage Dockerfile for gbrain serve --http
# Builder compiles a Linux x64 single-file binary via Bun --compile.
# Runtime image holds the compiled binary + admin/dist static assets.

FROM oven/bun:1 AS builder
WORKDIR /app

# Install deps with the lockfile pinned
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the admin SPA + the gbrain binary
COPY . .
RUN bun run build:admin || true
RUN bun build --compile --target=bun-linux-x64 --outfile bin/gbrain src/cli.ts


FROM oven/bun:1
WORKDIR /app

# Compiled binary + admin static assets
COPY --from=builder /app/bin/gbrain /app/bin/gbrain
COPY --from=builder /app/admin/dist /app/admin/dist

# Tighter exec context — gbrain expects to find admin/dist relative to cwd
ENV PATH="/app/bin:${PATH}"

EXPOSE 3131
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3131/health || exit 1

# Default command — Fly's [processes] block in fly.toml overrides for app-specific flags
# ROOT CAUSE FIX 2026-07-27: this CMD shipped `--enable-dcr`, so the IMAGE default
# was unauthenticated Dynamic Client Registration — any internet caller could
# self-register a client and (before the consent gate in v0.42.55.0) mint an
# admin-scoped token. fly.toml's [processes] override happened to omit it, but an
# image whose default is "open registration" reopens the hole the moment a
# deployment loses its process override. Secure by default; a deployment that
# genuinely needs DCR opts in explicitly. Never add --enable-dcr-insecure.
# --bind 0.0.0.0 is required since v0.34.1 changed the default bind to 127.0.0.1
# (a container bound to loopback is unreachable by any orchestrator's proxy).
CMD ["/app/bin/gbrain", "serve", "--http", "--bind", "0.0.0.0", "--port", "3131"]
