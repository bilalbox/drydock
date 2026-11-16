resource "aws_vpc" "retail" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "retaildemostore-vpc"
  }
}

resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.retail.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1a"

  tags = {
    Name = "retaildemostore-private-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.retail.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "us-east-1b"

  tags = {
    Name = "retaildemostore-private-2"
  }
}

resource "aws_security_group" "vpclink" {
  name   = "retaildemostore-vpclink-sg"
  vpc_id = aws_vpc.retail.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "products" {
  name               = "retaildemostore-products-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  security_groups    = [aws_security_group.vpclink.id]
}

resource "aws_lb_target_group" "products" {
  name        = "retaildemostore-products-tg"
  port        = 80
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = aws_vpc.retail.id
}

resource "aws_lb_listener" "products" {
  load_balancer_arn = aws_lb.products.arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.products.arn
  }
}

resource "aws_lb" "orders" {
  name               = "retaildemostore-orders-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  security_groups    = [aws_security_group.vpclink.id]
}

resource "aws_lb_target_group" "orders" {
  name        = "retaildemostore-orders-tg"
  port        = 80
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = aws_vpc.retail.id
}

resource "aws_lb_listener" "orders" {
  load_balancer_arn = aws_lb.orders.arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.orders.arn
  }
}

resource "aws_apigatewayv2_vpc_link" "retail" {
  name               = "retaildemostore-vpclink"
  security_group_ids = [aws_security_group.vpclink.id]
  subnet_ids         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
}

resource "aws_apigatewayv2_api" "retail" {
  name          = "retaildemostore-http-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.retail.id
  name        = "$default"
  auto_deploy = true
}

data "aws_iam_policy_document" "cognito_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cognito_auth" {
  name               = "retaildemostore-cognito-auth"
  assume_role_policy = data.aws_iam_policy_document.cognito_trust.json
}

resource "aws_iam_role" "cognito_unauth" {
  name               = "retaildemostore-cognito-unauth"
  assume_role_policy = data.aws_iam_policy_document.cognito_trust.json
}

resource "aws_apigatewayv2_integration" "products" {
  api_id                 = aws_apigatewayv2_api.retail.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = aws_lb_listener.products.arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.retail.id
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_integration" "orders" {
  api_id                 = aws_apigatewayv2_api.retail.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = aws_lb_listener.orders.arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.retail.id
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "get_product" {
  api_id             = aws_apigatewayv2_api.retail.id
  route_key          = "GET /products/{id}"
  authorization_type = "AWS_IAM"
  target             = "integrations/${aws_apigatewayv2_integration.products.id}"
}

resource "aws_apigatewayv2_route" "get_categories" {
  api_id             = aws_apigatewayv2_api.retail.id
  route_key          = "GET /categories"
  authorization_type = "AWS_IAM"
  target             = "integrations/${aws_apigatewayv2_integration.products.id}"
}

resource "aws_apigatewayv2_route" "get_orders" {
  api_id             = aws_apigatewayv2_api.retail.id
  route_key          = "GET /orders"
  authorization_type = "AWS_IAM"
  target             = "integrations/${aws_apigatewayv2_integration.orders.id}"
}

resource "aws_apigatewayv2_route" "post_orders" {
  api_id             = aws_apigatewayv2_api.retail.id
  route_key          = "POST /orders"
  authorization_type = "AWS_IAM"
  target             = "integrations/${aws_apigatewayv2_integration.orders.id}"
}

resource "aws_iam_role_policy" "unauth_api" {
  name = "retaildemostore-unauth-api-access"
  role = aws_iam_role.cognito_unauth.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "execute-api:Invoke"
        Resource = [
          "${aws_apigatewayv2_api.retail.execution_arn}/*/GET/products/*",
          "${aws_apigatewayv2_api.retail.execution_arn}/*/GET/categories",
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "auth_api" {
  name = "retaildemostore-auth-api-access"
  role = aws_iam_role.cognito_auth.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "execute-api:Invoke"
        Resource = [
          "${aws_apigatewayv2_api.retail.execution_arn}/*/GET/products/*",
          "${aws_apigatewayv2_api.retail.execution_arn}/*/GET/categories",
          "${aws_apigatewayv2_api.retail.execution_arn}/*/GET/orders",
          "${aws_apigatewayv2_api.retail.execution_arn}/*/POST/orders",
        ]
      }
    ]
  })
}
