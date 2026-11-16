The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab.

1. Declare an `aws_dynamodb_table` named `products` with `name = "retaildemostore-products"`, `billing_mode = "PAY_PER_REQUEST"`, `hash_key = "id"`, string attributes `id`, `category`, and `featured`, and two `global_secondary_index` blocks (`category-index` on `category` and `featured-index` on `featured`, both with `projection_type = "ALL"`).
2. Declare an `aws_dynamodb_table` named `categories` with `name = "retaildemostore-categories"`, `billing_mode = "PAY_PER_REQUEST"`, `hash_key = "id"`, string attributes `id` and `name`, and a `global_secondary_index` named `name-index` on `name` with `projection_type = "ALL"`.
3. Run `terraform apply` in the Terminal, then press Check.
