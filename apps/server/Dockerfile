# Kidora server — self-host container image.
#
# NOTE: this image is not yet built in CI (see docs/DEPLOYMENT.md). It follows
# the standard Next.js + Prisma pattern; openssl is installed explicitly so the
# Prisma query engine works on the Debian-slim base (the classic gotcha).
#
#   docker compose up -d   (from the repo root, with an .env — see DEPLOYMENT.md)
FROM node:20-bookworm-slim

# Prisma's query engine needs openssl at build (generate) and runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy the rest and build. The provider is fixed to postgres for the container
# (the compose file provisions Postgres); `prisma generate` runs in prebuild.
COPY . .
ENV DATABASE_PROVIDER=postgresql
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Sync the schema (idempotent, retried until the DB is reachable) then start.
CMD ["sh", "docker-entrypoint.sh"]
