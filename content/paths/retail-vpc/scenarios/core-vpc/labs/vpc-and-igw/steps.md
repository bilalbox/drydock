The provider in `provider.tf` already targets the local emulator. Edit `main.tf` in the Editor tab.

1. In `main.tf`, declare an `aws_vpc` named `retail` with `cidr_block = "10.0.0.0/16"`, `enable_dns_support = true`, `enable_dns_hostnames = true`, and `tags = { Name = "retaildemostore-vpc" }`.
2. Declare an `aws_internet_gateway` named `retail` with `vpc_id = aws_vpc.retail.id` and `tags = { Name = "retaildemostore-igw" }`.
3. In the Terminal, run `terraform apply`. When it completes, press Check.
