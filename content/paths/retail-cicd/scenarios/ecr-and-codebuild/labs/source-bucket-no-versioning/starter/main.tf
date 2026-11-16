resource "aws_ecr_repository" "products" {
  name         = "retaildemostore/products"
  force_delete = true
}

resource "aws_s3_bucket" "source" {
  bucket        = "retaildemostore-pipeline-source"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "source" {
  bucket                  = aws_s3_bucket.source.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
