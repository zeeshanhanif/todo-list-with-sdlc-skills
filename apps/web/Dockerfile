# Web tier image for Cloud Run (ADR-004). Build context = repo root. Uses Next's
# standalone output. Written for the skeleton; NOT built or deployed here.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci
COPY packages/shared ./packages/shared
COPY docs/tokens.json ./docs/tokens.json
COPY scripts ./scripts
COPY apps/web ./apps/web
RUN npm run build -w @todo/shared && npm run build -w @todo/web

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
