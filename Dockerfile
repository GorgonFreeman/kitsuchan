FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js utils.js ./
COPY src ./src
COPY pages ./pages
COPY utils ./utils
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js shopify-server.js ./
COPY api ./api
COPY utils ./utils
COPY --from=builder /app/dist ./dist
ENV PORT=8080
EXPOSE 8080
CMD [ "node", "server.js" ]
