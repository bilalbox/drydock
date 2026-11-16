The shared SSM service parameters are already configured.

Checkout request signing requires a private key stored outside Parameter Store:

- Create a Secrets Manager secret named `retaildemostore/payment-signing-key` containing a JSON secret value with `key_id` (`demo-key-1`) and `algorithm` (`RS256`).
- Create a managed IAM policy named `retaildemostore-read-payment-secret` that grants `secretsmanager:GetSecretValue` exclusively on that secret’s ARN.
- Keep the existing SSM parameters intact.
