import { AWS_ENDPOINT_KEYS } from "./awsEndpoints.js";

const ENDPOINT = "http://floci:4566";

export function awsBundle({ workspace, lock }) {
  const version = lock.providers.aws.version;
  const endpoints = AWS_ENDPOINT_KEYS.map((key) => `    ${key} = "${ENDPOINT}"`).join("\n");
  return {
    hcl: `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "${version}"
    }
  }
}

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
${endpoints}
  }
}
`,
    files: {
      ".aws/config": `[default]
region = us-east-1
output = json
cli_pager =
s3 =
    addressing_style = path
`,
      ".aws/credentials": `[default]
aws_access_key_id = test
aws_secret_access_key = test
`,
    },
    env: {
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
      AWS_DEFAULT_REGION: "us-east-1",
      AWS_REGION: "us-east-1",
      AWS_ENDPOINT_URL: ENDPOINT,
      AWS_EC2_METADATA_DISABLED: "true",
      AWS_REQUEST_CHECKSUM_CALCULATION: "when_required",
      AWS_RESPONSE_CHECKSUM_VALIDATION: "when_required",
      AWS_DEFAULT_OUTPUT: "json",
      AWS_PAGER: "",
      AWS_CONFIG_FILE: `${workspace}/.aws/config`,
      AWS_SHARED_CREDENTIALS_FILE: `${workspace}/.aws/credentials`,
    },
    prepare: [],
  };
}
