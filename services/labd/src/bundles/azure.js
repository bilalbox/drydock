import { providerFile } from "./common.js";

const PREPARE = "/opt/drydock/bin/drydock-prepare-azure";

export function materializeAzure({ workspace, lock }) {
  const version = lock.providers.azurerm.version;
  const bundle = `${workspace}/.drydock/ca-bundle.crt`;
  return {
    files: {
      "provider.tf": providerFile(`
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "${version}"
    }
  }
}

provider "azurerm" {
  features {}
  use_cli         = false
  metadata_host   = "floci-az:4577"
  subscription_id = "00000000-0000-0000-0000-000000000001"
  tenant_id       = "00000000-0000-0000-0000-000000000002"
  client_id       = "11111111-1111-1111-1111-111111111111"
  client_secret   = "floci-az-dev-secret"
}
`),
    },
    env: {
      SSL_CERT_FILE: bundle,
      REQUESTS_CA_BUNDLE: bundle,
      AZURE_CONFIG_DIR: `${workspace}/.azure`,
      ARM_SUBSCRIPTION_ID: "00000000-0000-0000-0000-000000000001",
      ARM_TENANT_ID: "00000000-0000-0000-0000-000000000002",
      ARM_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
      ARM_CLIENT_SECRET: "floci-az-dev-secret",
    },
    prepare: [[PREPARE, workspace]],
  };
}
