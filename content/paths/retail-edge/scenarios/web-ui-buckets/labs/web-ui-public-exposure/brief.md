Our security scanner flagged `retaildemostore-web-ui` for allowing public ACLs and public bucket policies. Someone tried an emergency fix in the console earlier today, and re-applying the current workspace leaves the bucket open.

Restore full public access blocking on `retaildemostore-web-ui` while keeping AES256 encryption and `retaildemostore-logging` untouched.
