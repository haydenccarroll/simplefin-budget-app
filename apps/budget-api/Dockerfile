FROM golang:1.26 AS build

WORKDIR /app

COPY . .
RUN CGO_ENABLED=0 go build -v -mod=vendor -o /budget-api .


# The web build of the app, served by the API from the same origin. It comes
# from the "webapp" build context (apps/simplefin-budget-app): pass
# --build-context webapp=../simplefin-budget-app, as docker-compose.yml and the
# deploy script do. The API host is left empty so the app calls the API on its
# own origin with relative URLs.
FROM node:22-alpine AS web
WORKDIR /app
COPY --from=webapp package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --from=webapp . .
ENV VITE_BUDGET_API_HOST=""
RUN npx vite build --outDir /web --emptyOutDir


# Litestream, for replicating the database to blob storage in the cloud.
FROM alpine:3.22 AS litestream
ARG LITESTREAM_VERSION=0.5.17
ARG TARGETARCH
RUN case "$TARGETARCH" in arm64) arch=arm64 ;; *) arch=x86_64 ;; esac \
    && wget -qO- "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz" \
    | tar -xz -C /usr/local/bin litestream


FROM alpine:3.22

# ca-certificates: the SimpleFIN bridge and blob storage are reached over TLS.
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 app \
    && mkdir /data && chown app:app /data

WORKDIR /app
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /budget-api /app/budget-api
COPY --from=web /web /app/web
COPY docker/entrypoint.sh /app/entrypoint.sh
COPY docker/litestream.yml /app/litestream.yml

USER app
# The SQLite database. Mount a volume here so it outlives the container (or
# set LITESTREAM_* to keep it in blob storage instead; see entrypoint.sh).
ENV DATABASE_PATH=/data/budget.db \
    WEB_ROOT=/app/web
VOLUME /data
EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["serve"]
