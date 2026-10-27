FROM node:24-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
COPY . .

RUN npm ci --legacy-peer-deps

ARG APP=learner
RUN npx nx build "${APP}" --configuration=production

FROM nginx:alpine AS static-runtime

ARG APP=learner
COPY --from=build /workspace/dist/apps/${APP}/browser/ /usr/share/nginx/html/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

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
