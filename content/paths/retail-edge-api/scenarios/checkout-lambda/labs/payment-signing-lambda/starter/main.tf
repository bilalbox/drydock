resource "aws_secretsmanager_secret" "payment_signing" {
  name                    = "retaildemostore/payment-signing-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "payment_signing" {
  secret_id = aws_secretsmanager_secret.payment_signing.id
  secret_string = jsonencode({
    key_id    = "demo-key-1"
    algorithm = "RS256"
  })
}
