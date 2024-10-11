FROM oven/bun:latest

WORKDIR /app

COPY package.json .
COPY bun.lockb .

RUN bun install

COPY src src
COPY tsconfig.json .

RUN mkdir -p /app/prisma
COPY prisma/schema.prisma prisma/

RUN bun prisma generate

ENV NODE_ENV=production
CMD ["bun", "src/index.ts"]

EXPOSE 8000