`state.json` and `plan.json` are synthetic examples retained for targeted parser
assertions, sensitive redaction, and schema cases.

`real-state.json` and `real-plan.json` were captured on 2026-11-17 with the
repository's cached `drydock-toolbox:latest` and `floci/floci:2.5.0` images in
isolated temporary containers. Terraform/provider versions are in the JSON.
The provider bundle came from `awsBundle()` using `providers.lock.json`, with
its endpoint changed to `http://127.0.0.1:4566` because the toolbox shared the
emulator's network namespace. Only dummy `test` credentials are present.

Capture recipe:

1. Initialize and apply this workspace:

   ```hcl
   resource "aws_s3_bucket" "update" { bucket = "drydock-diagram-update" }
   resource "aws_s3_bucket" "delete" { bucket = "drydock-diagram-delete" }
   resource "aws_sqs_queue" "replace" { name = "drydock-diagram-before" }
   ```

2. Save `terraform show -json` as `real-state.json`.
3. Remove bucket `delete`, add bucket `create` named `drydock-diagram-create`,
   add `tags = { Purpose = "diagram" }` to bucket `update`, and change queue
   `replace`'s name to `drydock-diagram-after`.
4. Simulate a console edit:

   ```sh
   aws --endpoint-url http://127.0.0.1:4566 s3api put-bucket-tagging \
     --bucket drydock-diagram-update \
     --tagging '{"TagSet":[{"Key":"Owner","Value":"console"}]}'
   ```

5. Run `terraform plan -refresh=true -lock=false -input=false -out=capture.tfplan`,
   then save `terraform show -json capture.tfplan` as `real-plan.json`.

Floci also reports provider-normalized changes for the other refreshed resources;
we preserve the actual output rather than editing it to look cleaner. The
renderer integration test requires the deliberate bucket tag drift and all four
planned actions. Module/index cases remain synthetic regression tests.
