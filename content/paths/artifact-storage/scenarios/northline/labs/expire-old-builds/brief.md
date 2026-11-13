Northline's bucket `northline-artifacts` is already versioned, and public access is blocked. Every nightly copy is a full object, and every copy is kept.

Expire noncurrent versions after 30 days. Abort incomplete multipart uploads after 7 days. The current object stays. Versioning stays enabled. Public access stays blocked. The rule covers the whole bucket.
