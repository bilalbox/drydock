The `retaildemostore-web-ui` bucket, Origin Access Control (`retaildemostore-oac`), cache policy (`retaildemostore-cache-policy`), and origin request policy (`retaildemostore-origin-request-policy`) are already defined.

Deploy the CloudFront distribution and bucket access policy for the storefront:

- Create an enabled CloudFront distribution named/commented `Retail Demo Store Web UI` with default root object `index.html`.
- Point its S3 origin at `retaildemostore-web-ui` using `retaildemostore-oac`.
- Configure the default cache behavior to allow `GET` and `HEAD`, redirect HTTP viewers to HTTPS (`redirect-to-https`), compress responses, and attach `retaildemostore-cache-policy` and `retaildemostore-origin-request-policy`.
- Keep all four public access block settings enabled on `retaildemostore-web-ui`, and attach a bucket policy allowing `s3:GetObject` from principal `cloudfront.amazonaws.com` only when `AWS:SourceArn` matches the distribution ARN.
