Provisioning the Retail Demo Store subnets failed during deployment, leaving the second public subnet and routing unfinished.

The target layout requires two public subnets (`10.0.0.0/24` in `us-east-1a` and `10.0.1.0/24` in `us-east-1b` with public IP assignment enabled), two private subnets (`10.0.2.0/24` in `us-east-1a` and `10.0.3.0/24` in `us-east-1b` with public IP assignment disabled), and the `retaildemostore-public-rt` route table routing `0.0.0.0/0` to `retaildemostore-igw` for both public subnets.
