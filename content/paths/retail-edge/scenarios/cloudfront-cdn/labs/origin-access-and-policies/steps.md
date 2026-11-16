The private `retaildemostore-web-ui` S3 bucket is already declared in `main.tf`.

1. Declare an `aws_cloudfront_origin_access_control` named `retail` with `name = "retaildemostore-oac"`, `origin_access_control_origin_type = "s3"`, `signing_behavior = "always"`, and `signing_protocol = "sigv4"`.
2. Declare an `aws_cloudfront_cache_policy` named `retail` with `name = "retaildemostore-cache-policy"`, `min_ttl = 0`, `default_ttl = 86400`, `max_ttl = 31536000`, and `parameters_in_cache_key_and_forwarded_to_origin` configured with `enable_accept_encoding_gzip = true`, `enable_accept_encoding_brotli = true`, and `header_behavior = "none"`, `cookie_behavior = "none"`, `query_string_behavior = "none"`.
3. Declare an `aws_cloudfront_origin_request_policy` named `retail` with `name = "retaildemostore-origin-request-policy"` and `none` behavior for headers, cookies, and query strings.
4. Run `terraform apply` in the Terminal, then press Check.
