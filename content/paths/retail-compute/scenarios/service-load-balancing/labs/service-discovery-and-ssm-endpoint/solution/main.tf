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

resource "aws_service_discovery_private_dns_namespace" "retail" {
  name        = "retaildemostore.local"
  description = "Private DNS namespace for Retail Demo Store microservices"
  vpc         = aws_vpc.retail.id
}

resource "aws_security_group" "products_lb" {
  name        = "retaildemostore-products-lb-sg"
  description = "Allow internal VPC traffic to products NLB"
  vpc_id      = aws_vpc.retail.id

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
  security_groups    = [aws_security_group.products_lb.id]
}

resource "aws_lb_target_group" "products" {
  name        = "retaildemostore-products-tg"
  port        = 80
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = aws_vpc.retail.id

  health_check {
    protocol          = "HTTP"
    path              = "/"
    port              = "80"
    interval          = 10
    healthy_threshold = 2
  }
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

resource "aws_service_discovery_service" "products" {
  name = "products"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.retail.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }
}

resource "aws_ssm_parameter" "products_lb_url" {
  name  = "/retaildemostore/services_load_balancers/products"
  type  = "String"
  value = "http://${aws_lb.products.dns_name}"
}
