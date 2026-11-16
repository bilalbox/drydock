resource "aws_s3_bucket" "web_ui" {
  bucket        = "retaildemostore-web-ui"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "web_ui" {
  bucket                  = aws_s3_bucket.web_ui.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
