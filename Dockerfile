# Frontend images. Railway builds the last stage, static-runtime (learner, admin,
# superadmin; set APP). docker compose picks stages by target. The storefront's
# Railway image is docker/storefront.Dockerfile, because Railway cannot pick a stage.
FROM node:24-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
COPY . .

RUN npm ci --legacy-peer-deps

ARG APP=learner
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

FROM nginx:alpine AS static-runtime

ARG APP=learner
COPY --from=build /workspace/dist/apps/${APP}/browser/ /usr/share/nginx/html/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
