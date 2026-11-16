locals {
  extra_services = toset(["carts", "orders"])
}

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

resource "aws_security_group" "services" {
  name   = "retaildemostore-services-sg"
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

resource "aws_ecs_cluster" "retail" {
  name = "retaildemostore"
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/retaildemostore"
  retention_in_days = 7
}

resource "aws_service_discovery_private_dns_namespace" "retail" {
  name = "retaildemostore.local"
  vpc  = aws_vpc.retail.id
}

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "retaildemostore-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role" "service_task" {
  name               = "retaildemostore-service-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
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

resource "aws_lb" "products" {
  name               = "retaildemostore-products-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  security_groups    = [aws_security_group.services.id]
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

resource "aws_ecs_task_definition" "products" {
  family                   = "retaildemostore-products"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.service_task.arn

  container_definitions = jsonencode([
    {
      name      = "products"
      image     = "public.ecr.aws/docker/library/nginx:alpine"
      essential = true
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
          protocol      = "tcp"
        }
      ]
    }
  ])
}

resource "aws_ecs_service" "products" {
  name            = "products"
  cluster         = aws_ecs_cluster.retail.id
  task_definition = aws_ecs_task_definition.products.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
    security_groups = [aws_security_group.services.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.products.arn
    container_name   = "products"
    container_port   = 80
  }

  service_registries {
    registry_arn = aws_service_discovery_service.products.arn
  }
}

resource "aws_service_discovery_service" "extra" {
  for_each = local.extra_services
  name     = each.key

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.retail.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }
}

resource "aws_lb" "extra" {
  for_each           = local.extra_services
  name               = "retaildemostore-${each.key}-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = [aws_subnet.private_1.id, aws_subnet.private_2.id]
  security_groups    = [aws_security_group.services.id]
}

resource "aws_lb_target_group" "extra" {
  for_each    = local.extra_services
  name        = "retaildemostore-${each.key}-tg"
  port        = 80
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = aws_vpc.retail.id
}

resource "aws_lb_listener" "extra" {
  for_each          = local.extra_services
  load_balancer_arn = aws_lb.extra[each.key].arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.extra[each.key].arn
  }
}

resource "aws_ecs_task_definition" "extra" {
  for_each                 = local.extra_services
  family                   = "retaildemostore-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.service_task.arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "public.ecr.aws/docker/library/nginx:alpine"
      essential = true
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
          protocol      = "tcp"
        }
      ]
    }
  ])
}

resource "aws_ecs_service" "extra" {
  for_each        = local.extra_services
  name            = each.key
  cluster         = aws_ecs_cluster.retail.id
  task_definition = aws_ecs_task_definition.extra[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [aws_subnet.private_1.id, aws_subnet.private_2.id]
    security_groups = [aws_security_group.services.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.extra[each.key].arn
    container_name   = each.key
    container_port   = 80
  }

  service_registries {
    registry_arn = aws_service_discovery_service.extra[each.key].arn
  }
}
