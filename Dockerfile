# Build stage
FROM node:24.19.0-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:24.19.0-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache dumb-init

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "\
const http=require('http');\
const req=http.get('http://127.0.0.1:3000/health/live', (r)=>process.exit(r.statusCode===200?0:1));\
req.on('error', ()=>process.exit(1));\
req.setTimeout(8000, ()=>{req.destroy(); process.exit(1);});\
"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
