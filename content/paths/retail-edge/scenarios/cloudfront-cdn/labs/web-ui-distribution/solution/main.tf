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

resource "aws_cloudfront_origin_access_control" "retail" {
  name                              = "retaildemostore-oac"
  description                       = "OAC for Retail Demo Store S3 origins"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "retail" {
  name        = "retaildemostore-cache-policy"
  min_ttl     = 0
  default_ttl = 86400
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_origin_request_policy" "retail" {
  name = "retaildemostore-origin-request-policy"

  cookies_config {
    cookie_behavior = "none"
  }
  headers_config {
    header_behavior = "none"
  }
  query_strings_config {
    query_string_behavior = "none"
  }
}

resource "aws_cloudfront_distribution" "web_ui" {
  enabled             = true
  comment             = "Retail Demo Store Web UI"
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.web_ui.bucket_regional_domain_name
    origin_id                = "web-ui-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.retail.id
  }

  default_cache_behavior {
    target_origin_id         = "web-ui-s3"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.retail.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.retail.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "web_ui" {
  bucket = aws_s3_bucket.web_ui.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web_ui.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.web_ui.arn
          }
        }
      }
    ]
  })
}
