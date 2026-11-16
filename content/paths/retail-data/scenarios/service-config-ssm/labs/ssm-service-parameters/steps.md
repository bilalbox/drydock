The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab.

1. Declare three `aws_ssm_parameter` resources with `type = "String"`:
   - `stack_bucket`: `name = "/retaildemostore/stack_bucket"`, `value = "retaildemostore-stack"`
   - `eventbus`: `name = "/retaildemostore/eventbus"`, `value = "retaildemostore-bus"`
   - `opensearch_endpoint`: `name = "/retaildemostore/opensearch/endpoint"`, `value = "https://search.retaildemostore.local"`
2. Run `terraform apply` in the Terminal, then press Check.
