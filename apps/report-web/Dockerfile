FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/report-web/package.json apps/report-web/

RUN npm ci --workspace=@sre/shared-types --workspace=@sre/report-web --include-workspace-root 2>/dev/null || npm install

COPY packages/shared-types packages/shared-types
COPY apps/report-web apps/report-web
COPY tsconfig.base.json ./

RUN cd packages/shared-types && npm run build || true
RUN cd apps/report-web && npm run build

FROM nginx:alpine
COPY --from=builder /app/apps/report-web/dist /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
