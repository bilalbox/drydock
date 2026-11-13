const ENDPOINT = "http://floci-oci:4599";
const KEY_PATH = "/opt/drydock/oci-dummy.pem";
// MD5 of the DER public key for services/toolbox/oci-dummy.pem.
const FINGERPRINT = "a9:32:e8:ba:33:c0:15:a7:3d:69:68:19:b6:01:fb:24";

const DEFAULT_CLIENTS = [
  "oci_identity.IdentityClient",
  "oci_object_storage.ObjectStorageClient",
  "oci_core.ComputeClient",
  "oci_core.VirtualNetworkClient",
  "oci_kms.KmsVaultClient",
  "oci_queue.QueueClient",
];

export function ociBundle({ lab, lock }) {
  const version = lock.providers.oci.version;
  const clients = (lab.services ?? []).some((service) => service.includes("."))
    ? lab.services.filter((service) => service.includes("."))
    : DEFAULT_CLIENTS;
  const overrides = clients.map((client) => `${client}=${ENDPOINT}`).join(";");
  return {
    hcl: `
terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "${version}"
    }
  }
}

provider "oci" {
  tenancy_ocid         = "ocid1.tenancy.oc1..flocilocaltenancy0000000000000000000000000000000000000000"
  user_ocid            = "ocid1.user.oc1..anyuser"
  fingerprint          = "${FINGERPRINT}"
  private_key_path     = "${KEY_PATH}"
  region               = "us-ashburn-1"
  disable_auto_retries = true
}
`,
    files: {},
    // The provider reads CLIENT_HOST_OVERRIDES from the process environment.
    env: {
      CLIENT_HOST_OVERRIDES: overrides,
      OCI_CLI_AUTH: "api_key",
    },
    prepare: [],
  };
}
