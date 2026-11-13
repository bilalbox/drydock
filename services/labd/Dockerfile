FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY services/web/package.json services/web/package-lock.json ./
RUN npm ci
COPY services/web/ ./
RUN npm run build

FROM node:24-bookworm-slim
ARG TARGETARCH=amd64
ARG TERRAFORM_VERSION=1.17.2
ARG TERRAFORM_LS_VERSION=0.39.1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/* \
    && case "$TARGETARCH" in \
         amd64) arch=amd64 ;; \
         arm64) arch=arm64 ;; \
         *) echo "unsupported architecture $TARGETARCH" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${arch}.zip" -o /tmp/terraform.zip \
    && unzip -qo /tmp/terraform.zip -d /usr/local/bin \
    && curl -fsSL "https://releases.hashicorp.com/terraform-ls/${TERRAFORM_LS_VERSION}/terraform-ls_${TERRAFORM_LS_VERSION}_linux_${arch}.zip" -o /tmp/terraform-ls.zip \
    && unzip -qo /tmp/terraform-ls.zip -d /usr/local/bin \
    && rm -f /tmp/terraform.zip /tmp/terraform-ls.zip \
    && chmod 755 /usr/local/bin/terraform /usr/local/bin/terraform-ls
WORKDIR /opt/drydock/labd
COPY services/labd/package.json services/labd/package-lock.json ./
RUN npm ci --omit=dev
COPY services/labd/src ./src
COPY content /opt/drydock/content
COPY providers.lock.json /opt/drydock/providers.lock.json
COPY --from=web /web/dist /opt/drydock/web
ENV CONTENT_DIR=/opt/drydock/content \
    LOCK_PATH=/opt/drydock/providers.lock.json \
    WEB_DIR=/opt/drydock/web \
    PROGRESS_PATH=/data/progress.json \
    WORKSPACES_DIR=/workspaces \
    CHECKS_DIR=/opt/drydock/checks \
    TOOLBOX_CONTAINER=drydock-toolbox \
    FLOCI_UI_ORIGIN=http://floci-ui:4500 \
    PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
