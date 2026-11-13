# Versions are copied from providers.lock.json. The lock test fails if they drift.
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.73.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "4.81.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "8.11.0"
    }
    oci = {
      source  = "oracle/oci"
      version = "9.12.1"
    }
  }
}
