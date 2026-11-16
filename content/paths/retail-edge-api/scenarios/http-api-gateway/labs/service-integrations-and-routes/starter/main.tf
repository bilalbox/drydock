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
