The VPC and private subnets are already defined in `main.tf`.

1. Declare an `aws_security_group` named `products_lb` with `name = "retaildemostore-products-lb-sg"`, `vpc_id = aws_vpc.retail.id`, allowing TCP port `80` from `10.0.0.0/16`.
2. Declare an `aws_lb` named `products` with `name = "retaildemostore-products-nlb"`, `internal = true`, `load_balancer_type = "network"`, `subnets = [aws_subnet.private_1.id, aws_subnet.private_2.id]`, and `security_groups = [aws_security_group.products_lb.id]`.
3. Declare an `aws_lb_target_group` named `products` with `name = "retaildemostore-products-tg"`, `port = 80`, `protocol = "TCP"`, `target_type = "ip"`, `vpc_id = aws_vpc.retail.id`, and a `health_check` block (`protocol = "HTTP"`, `path = "/"`, `port = "80"`, `interval = 10`, `healthy_threshold = 2`).
4. Declare an `aws_lb_listener` named `products` forwarding TCP port `80` on `aws_lb.products.arn` to `aws_lb_target_group.products.arn`.
5. Run `terraform apply` in the Terminal, then press Check.
