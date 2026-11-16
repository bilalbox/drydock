The `retaildemostore-products` and `retaildemostore-categories` tables are already defined.

Keep those tables intact and add two on-demand (`PAY_PER_REQUEST`) DynamoDB tables for shopping sessions and completed purchases:

- `retaildemostore-carts`: string partition key `id`, a global secondary index named `username-index` projecting all attributes on string key `username`, and Time to Live enabled on attribute `ttl`.
- `retaildemostore-orders`: string partition key `id`, and a global secondary index named `username-index` projecting all attributes on string key `username`.
