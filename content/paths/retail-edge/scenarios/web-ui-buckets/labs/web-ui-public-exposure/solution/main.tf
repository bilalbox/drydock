resource "aws_s3_bucket" "logging" {
  bucket        = "retaildemostore-logging"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "logging" {
  bucket = aws_s3_bucket.logging.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "logging" {
  bucket                  = aws_s3_bucket.logging.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "web_ui" {
  bucket        = "retaildemostore-web-ui"
  force_destroy = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web_ui" {
  bucket = aws_s3_bucket.web_ui.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "web_ui" {
  bucket                  = aws_s3_bucket.web_ui.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
