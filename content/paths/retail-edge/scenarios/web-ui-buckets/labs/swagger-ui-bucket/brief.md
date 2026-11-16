The `retaildemostore-logging` and `retaildemostore-web-ui` buckets are already provisioned.

The Retail Demo Store also hosts an OpenAPI Swagger UI bundle for developers. Keep the existing buckets intact and add a private bucket named `retaildemostore-swagger-ui` with:

- Versioning enabled
- Default server-side encryption using AES256
- All four public access block protections enabled
