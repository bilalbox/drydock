const ORIGIN = "http://floci-gcp:4588";

// Paths match the floci-gcp Terraform compatibility suite, plus GKE host-mode routing.
const TERRAFORM_ENDPOINTS = {
  storage_custom_endpoint: `${ORIGIN}/storage/v1/`,
  iam_custom_endpoint: `${ORIGIN}/`,
  iam_beta_custom_endpoint: `${ORIGIN}/v1/`,
  secret_manager_custom_endpoint: `${ORIGIN}/v1/`,
  cloud_run_custom_endpoint: `${ORIGIN}/v2/`,
  cloud_run_v2_custom_endpoint: `${ORIGIN}/v2/`,
  sql_custom_endpoint: `${ORIGIN}/sql/v1beta4/`,
  kms_custom_endpoint: `${ORIGIN}/v1/`,
  pubsub_custom_endpoint: `${ORIGIN}/v1/`,
  big_query_custom_endpoint: `${ORIGIN}/bigquery/v2/`,
  service_usage_custom_endpoint: `${ORIGIN}/v1/`,
  resource_manager_custom_endpoint: `${ORIGIN}/v1/`,
  cloud_billing_custom_endpoint: `${ORIGIN}/v1/`,
  container_custom_endpoint: "http://container.floci-gcp:4588/",
};

const GCLOUD_OVERRIDES = {
  storage: ["STORAGE", `${ORIGIN}/`],
  pubsub: ["PUBSUB", `${ORIGIN}/`],
  serviceusage: ["SERVICEUSAGE", `${ORIGIN}/`],
  resourcemanager: ["CLOUDRESOURCEMANAGER", `${ORIGIN}/`],
  cloudbilling: ["CLOUDBILLING", `${ORIGIN}/`],
  kms: ["CLOUDKMS", `${ORIGIN}/`],
  secretmanager: ["SECRETMANAGER", `${ORIGIN}/`],
  iam: ["IAM", `${ORIGIN}/`],
  compute: ["COMPUTE", `${ORIGIN}/`],
  container: ["CONTAINER", `${ORIGIN}/container/`],
};

export function gcpBundle({ lab, lock }) {
  const version = lock.providers.google.version;
  const endpointLines = Object.entries(TERRAFORM_ENDPOINTS)
    .map(([key, value]) => `  ${key} = "${value}"`)
    .join("\n");
  const selected = lab.services?.length
    ? lab.services.map((name) => name.toLowerCase())
    : Object.keys(GCLOUD_OVERRIDES);
  const env = {
    GOOGLE_OAUTH_ACCESS_TOKEN: "fake-token",
    GOOGLE_PROJECT: "floci-local",
    CLOUDSDK_CORE_PROJECT: "floci-local",
    CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
    CLOUDSDK_AUTH_DISABLE_CREDENTIALS: "true",
  };
  for (const name of selected) {
    const known = GCLOUD_OVERRIDES[name];
    if (known) {
      env[`CLOUDSDK_API_ENDPOINT_OVERRIDES_${known[0]}`] = known[1];
    } else {
      env[`CLOUDSDK_API_ENDPOINT_OVERRIDES_${name.toUpperCase()}`] = `${ORIGIN}/`;
    }
  }
  return {
    hcl: `
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "${version}"
    }
  }
}

provider "google" {
  project               = "floci-local"
  region                = "us-central1"
  user_project_override = false

${endpointLines}
}
`,
    files: {},
    env,
    prepare: [],
  };
}
