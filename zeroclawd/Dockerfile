# syntax=docker/dockerfile:1

# ── Stage 0: Vite console ─────────────────────────────────────────────
# web/frontend/embed.go uses //go:embed all:dist, so the Go build fails
# unless dist/ exists with at least one file. **/dist is dockerignored.
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY web/frontend/package.json web/frontend/package-lock.json ./
RUN npm ci
COPY web/frontend/ ./
RUN npm run build

# ── Stage 1: Build ────────────────────────────────────────────────────
FROM golang:1.26.4-alpine AS builder

RUN apk add --no-cache git make

WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
COPY --from=frontend /frontend/dist /src/web/frontend/dist

# Optional: fly deploy --build-arg CLAWD_VERSION=$(git describe --tags --always)
ARG CLAWD_VERSION=dev
ENV CLAWD_VERSION=$CLAWD_VERSION

# CLI + long-running web console (HTTP API for Fly)
RUN make build \
 && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /src/build/clawdbot-web ./web/backend/ \
 && mkdir -p /src/build/frontend-dist \
 && cp -a /src/web/frontend/dist/. /src/build/frontend-dist/

# ── Stage 2: Runtime ──────────────────────────────────────────────────
FROM alpine:3.22

LABEL org.opencontainers.image.title="clawd-bot" \
      org.opencontainers.image.description="Clawd Bot runtime for the Solana Clawd ecosystem (CLI binary: clawdbot)" \
      org.opencontainers.image.source="https://github.com/Solizardking/Zero-Bruh" \
      org.opencontainers.image.documentation="https://github.com/solizardking/solana-clawd" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /src/build/clawdbot /app/clawdbot
COPY --from=builder /src/build/clawdbot-web /app/clawdbot-web
COPY --from=builder /src/build/frontend-dist /app/web/frontend/dist

# stub go.mod so findProjectRoot resolves /app as project root
RUN printf 'module github.com/8bitlabs/clawdbot\n\ngo 1.26\n' > /app/go.mod

# Create workspace
RUN mkdir -p /root/.clawdbot/workspace/vault/decisions \
             /root/.clawdbot/workspace/vault/lessons \
             /root/.clawdbot/workspace/vault/trades \
             /root/.clawdbot/workspace/vault/research \
             /root/.clawdbot/workspace/vault/inbox

# Fly http_service.internal_port must match this listen port.
ENV PORT=18800
EXPOSE 18800

# Do NOT use `clawdbot agent` here — interactive REPL exits with code 0 without a TTY.
# Web console stays up and serves /api/health · /api/status for Fly probes.
ENTRYPOINT ["/app/clawdbot-web"]
CMD ["-public", "-port", "18800", "-no-browser"]
