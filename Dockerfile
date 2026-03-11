FROM node:22-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/agents/package.json packages/agents/
COPY packages/api/package.json packages/api/
COPY packages/sdk/package.json packages/sdk/

RUN npm ci --omit=dev && npm install tsx

# Copy source
COPY packages/ packages/
COPY tsconfig.json ./

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npx", "tsx", "packages/api/src/index.ts"]
