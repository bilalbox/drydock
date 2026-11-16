The HTTP API (`retaildemostore-http-api`), VPC Link (`retaildemostore-vpclink`), internal Network Load Balancers (`products` and `orders`), and Cognito IAM roles (`retaildemostore-cognito-auth` and `retaildemostore-cognito-unauth`) are already defined.

Connect the storefront API routes to their backend services and authorize callers:

- Create private HTTP proxy integrations over the VPC Link targeting the `products` and `orders` NLB listeners (`ANY`, payload format `1.0`).
- Add IAM-authorized (`AWS_IAM`) routes:
  - `GET /products/{id}` and `GET /categories` routed to `products`
  - `GET /orders` and `POST /orders` routed to `orders`
- Attach an inline IAM policy named `retaildemostore-unauth-api-access` to `retaildemostore-cognito-unauth` permitting `execute-api:Invoke` on the `GET` catalog routes, and `retaildemostore-auth-api-access` to `retaildemostore-cognito-auth` permitting `execute-api:Invoke` on both catalog and order routes.
