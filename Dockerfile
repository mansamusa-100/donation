# syntax=docker/dockerfile:1

FROM node:20-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN npm ci

COPY . .

# Same-origin SPA ↔ API (relative /api). Bake Google client ID at build time if provided.
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=

RUN npm run build:frontend
RUN npm run build:backend
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV UPLOADS_DIR=/app/uploads

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/uploads/avatars /app/uploads/campaign-covers /app/uploads/verification-ids

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/frontend/package.json ./frontend/
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/node_modules ./backend/node_modules

WORKDIR /app/backend
EXPOSE 4000

# Migrate then serve API + built SPA from one process.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
