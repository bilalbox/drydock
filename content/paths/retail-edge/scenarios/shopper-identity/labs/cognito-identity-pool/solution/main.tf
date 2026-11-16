resource "aws_cognito_user_pool" "retail" {
  name                     = "retaildemostore-user-pool"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_uppercase = true
    require_symbols   = false
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name            = "retaildemostore-web-client"
  user_pool_id    = aws_cognito_user_pool.retail.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}

resource "aws_cognito_identity_pool" "retail" {
  identity_pool_name               = "retaildemostore_identity_pool"
  allow_unauthenticated_identities = true

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.web.id
    provider_name           = aws_cognito_user_pool.retail.endpoint
    server_side_token_check = false
  }
}

data "aws_iam_policy_document" "cognito_auth_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.retail.id]
    }
    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["authenticated"]
    }
  }
}

data "aws_iam_policy_document" "cognito_unauth_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.retail.id]
    }
    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["unauthenticated"]
    }
  }
}

resource "aws_iam_role" "cognito_auth" {
  name               = "retaildemostore-cognito-auth"
  assume_role_policy = data.aws_iam_policy_document.cognito_auth_trust.json
}

resource "aws_iam_role" "cognito_unauth" {
  name               = "retaildemostore-cognito-unauth"
  assume_role_policy = data.aws_iam_policy_document.cognito_unauth_trust.json
}

resource "aws_cognito_identity_pool_roles_attachment" "retail" {
  identity_pool_id = aws_cognito_identity_pool.retail.id

  roles = {
    authenticated   = aws_iam_role.cognito_auth.arn
    unauthenticated = aws_iam_role.cognito_unauth.arn
  }
}
