Private workloads in `retaildemostore-private-1` and `retaildemostore-private-2` pull build artifacts and assets from S3. Routing S3 traffic through the NAT Gateways adds unnecessary data-processing cost.

Keep all existing VPC, subnet, NAT Gateway, and route table resources intact, and add a Gateway VPC endpoint for Amazon S3 in `us-east-1` (`com.amazonaws.us-east-1.s3`) attached to both private route tables (`retaildemostore-private-rt-1` and `retaildemostore-private-rt-2`). Tag the endpoint `Name = retaildemostore-s3-endpoint`.
