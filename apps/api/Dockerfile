# API service image for Cloud Run (ADR-004). Build context = repo root.
# Written for the skeleton; NOT built or deployed here (first deploy is the
# user's step). Portable container — runs on any container platform (C-6).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm ci
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w @todo/shared && npm run build -w @todo/api

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
