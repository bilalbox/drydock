The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab.

1. Declare an `aws_s3_bucket` named `logging` with `bucket = "retaildemostore-logging"` and `force_destroy = true`.
2. Add `aws_s3_bucket_versioning` (`status = "Enabled"`), `aws_s3_bucket_server_side_encryption_configuration` (`sse_algorithm = "AES256"`), and `aws_s3_bucket_public_access_block` (all four flags `true`) for `aws_s3_bucket.logging`.
3. Declare an `aws_s3_bucket` named `web_ui` with `bucket = "retaildemostore-web-ui"` and `force_destroy = true`.
4. Add `aws_s3_bucket_server_side_encryption_configuration` (`sse_algorithm = "AES256"`) and `aws_s3_bucket_public_access_block` (all four flags `true`) for `aws_s3_bucket.web_ui`.
5. Run `terraform apply` in the Terminal, then press Check.
