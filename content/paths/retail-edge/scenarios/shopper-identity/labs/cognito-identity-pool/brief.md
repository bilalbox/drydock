The `retaildemostore-user-pool` Cognito User Pool and `retaildemostore-web-client` app client are already defined.

Configure federated identity credentials for signed-in shoppers and guest browsers:

- Create a Cognito Identity Pool named `retaildemostore_identity_pool` with unauthenticated identities enabled, linked to `retaildemostore-user-pool` and `retaildemostore-web-client`.
- Create two IAM roles whose trust policy allows `cognito-identity.amazonaws.com` via `sts:AssumeRoleWithWebIdentity`:
  - `retaildemostore-cognito-auth` (for `authenticated` identities)
  - `retaildemostore-cognito-unauth` (for `unauthenticated` identities)
- Attach both roles to the Identity Pool.
