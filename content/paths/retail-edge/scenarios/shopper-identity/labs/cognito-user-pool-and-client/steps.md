The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab.

1. Declare an `aws_cognito_user_pool` named `retail` with `name = "retaildemostore-user-pool"`, `username_attributes = ["email"]`, `auto_verified_attributes = ["email"]`, and a `password_policy` requiring `minimum_length = 8`, `require_lowercase = true`, `require_numbers = true`, and `require_uppercase = true`.
2. Declare an `aws_cognito_user_pool_client` named `web` with `name = "retaildemostore-web-client"`, `user_pool_id = aws_cognito_user_pool.retail.id`, `generate_secret = false`, and `explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]`.
3. Run `terraform apply` in the Terminal, then press Check.
