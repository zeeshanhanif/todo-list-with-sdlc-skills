# Cleanup/Outbox worker image — Cloud Run Job (ADR-007). Build context = repo
# root. Written for the skeleton; NOT built or deployed here.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/
RUN npm ci
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
RUN npm run build -w @todo/shared && npm run build -w @todo/worker

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/
# Cloud Run Job runs to completion then exits (no long-running server).
CMD ["node", "apps/worker/dist/main.js"]
