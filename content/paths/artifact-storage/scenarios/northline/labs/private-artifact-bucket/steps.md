The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab. Ctrl+S saves it, and the file also saves shortly after you stop typing. `provider.tf` is restored on reset.

Amazon's explanation of versioning and Block Public Access is under Why this is required.

1. In the Editor, declare an `aws_s3_bucket` named `artifacts` whose bucket is `northline-artifacts`.
2. Declare an `aws_s3_bucket_versioning` on that bucket. Set `versioning_configuration.status` to `Enabled`.
3. Declare an `aws_s3_bucket_public_access_block` on that bucket. Set all four flags to true: `block_public_acls`, `ignore_public_acls`, `block_public_policy`, and `restrict_public_buckets`.
4. In the Terminal, run `terraform apply`. When it finishes, press Check. The inspector's storage page should list the bucket; it will not let you create or delete it.
