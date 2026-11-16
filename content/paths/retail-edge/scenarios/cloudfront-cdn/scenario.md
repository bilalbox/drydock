The Retail Demo Store serves its static storefront from the private `retaildemostore-web-ui` bucket through CloudFront.

Because all public access to S3 is blocked, CloudFront must sign origin requests using an Origin Access Control (`retaildemostore-oac`), and use dedicated cache (`retaildemostore-cache-policy`) and origin-request (`retaildemostore-origin-request-policy`) policies before attaching the distribution and S3 bucket policy.
