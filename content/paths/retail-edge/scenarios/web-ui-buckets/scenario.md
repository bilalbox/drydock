The Retail Demo Store serves its storefront SPA and OpenAPI documentation from private S3 buckets behind CloudFront, while recording access logs in a dedicated logging bucket.

Create the logging bucket (`retaildemostore-logging`) and the storefront bucket (`retaildemostore-web-ui`) in `us-east-1`, both encrypted with AES256 and locked down against all public access. Enable versioning on `retaildemostore-logging`.
