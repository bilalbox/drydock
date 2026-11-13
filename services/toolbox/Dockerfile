# syntax=docker/dockerfile:1

FROM debian:bookworm-slim

ARG TARGETARCH
ARG TERRAFORM_VERSION=1.17.2
ARG AWSCLI_VERSION=2.40.1
ARG GCLOUD_VERSION=593.0.0
ARG AZURECLI_VERSION=2.92.0
ARG OCICLI_VERSION=3.96.2

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl unzip python3 python3-venv python3-pip python3-dev \
      gcc g++ make libffi-dev libssl-dev openssl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf python3 /usr/bin/python

RUN case "$TARGETARCH" in \
      amd64) tf_arch=amd64; aws_arch=x86_64; gcloud_arch=x86_64 ;; \
      arm64) tf_arch=arm64; aws_arch=aarch64; gcloud_arch=arm ;; \
      *) echo "unsupported architecture $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${tf_arch}.zip" -o /tmp/tf.zip \
    && unzip -q /tmp/tf.zip -d /usr/local/bin && rm /tmp/tf.zip \
    && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}-${AWSCLI_VERSION}.zip" -o /tmp/aws.zip \
    && unzip -q /tmp/aws.zip -d /tmp && /tmp/aws/install && rm -rf /tmp/aws /tmp/aws.zip \
    && curl -fsSL "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-${GCLOUD_VERSION}-linux-${gcloud_arch}.tar.gz" -o /tmp/gcloud.tgz \
    && tar -C /opt -xzf /tmp/gcloud.tgz && rm /tmp/gcloud.tgz \
    && if [ -f /opt/google-cloud-sdk/install.sh ]; then gcloud_root=/opt/google-cloud-sdk; \
       elif [ -f /opt/google-cloud-cli/install.sh ]; then gcloud_root=/opt/google-cloud-cli; \
       else echo "gcloud archive layout was not recognized" >&2; ls /opt >&2; exit 1; fi \
    && bash "$gcloud_root/install.sh" --quiet --usage-reporting=false --path-update=false \
    && ln -s "$gcloud_root/bin/gcloud" /usr/local/bin/gcloud \
    && if [ -e "$gcloud_root/bin/gsutil" ]; then ln -s "$gcloud_root/bin/gsutil" /usr/local/bin/gsutil; fi \
    && python3 -m venv /opt/drydock/azure-py \
    && python3 -m venv /opt/drydock/oci-py \
    && /opt/drydock/azure-py/bin/pip install --upgrade pip \
    && /opt/drydock/oci-py/bin/pip install --upgrade pip \
    && /opt/drydock/azure-py/bin/pip install "azure-cli==${AZURECLI_VERSION}" \
    && /opt/drydock/oci-py/bin/pip install "oci-cli==${OCICLI_VERSION}" \
    && ln -s /opt/drydock/azure-py/bin/az /usr/local/bin/az \
    && ln -s /opt/drydock/oci-py/bin/oci /usr/local/bin/oci

COPY services/toolbox/terraform.rc /opt/drydock/terraform.rc
COPY services/toolbox/mirror.tf /tmp/mirror/main.tf
COPY services/toolbox/oci-dummy.pem /opt/drydock/oci-dummy.pem
COPY services/toolbox/bin/drydock-prepare-azure /opt/drydock/bin/drydock-prepare-azure

RUN chmod 600 /opt/drydock/oci-dummy.pem \
    && chmod 755 /opt/drydock/bin/drydock-prepare-azure \
    && mkdir -p /opt/drydock/checks /opt/drydock/tf-mirror \
    && cd /tmp/mirror \
    && terraform providers mirror -platform="linux_${TARGETARCH}" /opt/drydock/tf-mirror \
    && rm -rf /tmp/mirror

ENV TF_CLI_CONFIG_FILE=/opt/drydock/terraform.rc \
    CHECKPOINT_DISABLE=1 \
    TF_IN_AUTOMATION=1

WORKDIR /workspaces
ENTRYPOINT ["sleep", "infinity"]
