# Storefront image for Railway (Node SSR). Same build as the root Dockerfile, with the
# storefront runtime as the last stage. Keep the two build stages in step.
FROM node:24-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
COPY . .

RUN npm ci --legacy-peer-deps

ARG APP=storefront
ARG CONFIGURATION=production
# Public build-time settings (Railway passes matching service variables). Without
# them the committed environment.ts is used. Never pass a secret: it ships in the bundle.
ARG FORGE_API_BASE_URL=
ARG FORGE_ROOT_DOMAIN=
ARG FORGE_CONTACT_EMAIL=
RUN FORGE_API_BASE_URL="${FORGE_API_BASE_URL}" FORGE_ROOT_DOMAIN="${FORGE_ROOT_DOMAIN}" \
    FORGE_CONTACT_EMAIL="${FORGE_CONTACT_EMAIL}" node scripts/forge-env.mjs "${APP}" \
 && npx nx build "${APP}" --configuration="${CONFIGURATION}"

FROM node:24-alpine AS storefront-runtime

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --workspaces=false --legacy-peer-deps

COPY --from=build --chown=node:node /workspace/dist/apps/storefront/browser/ ./browser/
COPY --from=build --chown=node:node /workspace/dist/apps/storefront/server/ ./server/

USER node
EXPOSE 4000
CMD ["node", "server/server.mjs"]
