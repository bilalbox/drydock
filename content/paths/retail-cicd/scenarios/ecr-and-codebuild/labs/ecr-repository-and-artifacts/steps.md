The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab.

1. Declare an `aws_ecr_repository` named `products` with `name = "retaildemostore/products"`, `force_delete = true`, and `image_scanning_configuration { scan_on_push = true }`.
2. Declare an `aws_s3_bucket` named `artifacts` with `bucket = "retaildemostore-pipeline-artifacts"`, `force_destroy = true`, and block all public access with `aws_s3_bucket_public_access_block`.
3. Declare an `aws_s3_bucket` named `source` with `bucket = "retaildemostore-pipeline-source"`, `force_destroy = true`, enable versioning (`status = "Enabled"`), and block all public access.
4. Run `terraform apply` in the Terminal, then press Check.
