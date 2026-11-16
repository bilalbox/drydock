The VPC, Internet Gateway, subnets, and public route table are already in `main.tf`.

1. Declare two `aws_eip` resources (`nat_1` and `nat_2`) with `domain = "vpc"`. Add `depends_on = [aws_internet_gateway.retail]`.
2. Declare two `aws_nat_gateway` resources (`nat_1` in `aws_subnet.public_1.id` using `aws_eip.nat_1.id`, tagged `Name = "retaildemostore-nat-1"`, and `nat_2` in `aws_subnet.public_2.id` using `aws_eip.nat_2.id`, tagged `Name = "retaildemostore-nat-2"`).
3. Declare two `aws_route_table` resources (`private_1` tagged `Name = "retaildemostore-private-rt-1"`, and `private_2` tagged `Name = "retaildemostore-private-rt-2"`), each with a `0.0.0.0/0` route pointing `nat_gateway_id` to its AZ's NAT Gateway.
4. Associate `aws_subnet.private_1` with `aws_route_table.private_1` and `aws_subnet.private_2` with `aws_route_table.private_2` using `aws_route_table_association`.
5. Run `terraform apply` in the Terminal, then press Check.
