Abandoned shopping carts in `retaildemostore-carts` are growing indefinitely, even though the service writes expiration epoch timestamps to the `ttl` attribute.

An emergency console change earlier this week did not fix expiration, and re-applying the current workspace leaves the table unchanged. Make sure `retaildemostore-carts` expires items via the `ttl` attribute while preserving both tables and their `username-index` GSIs.
