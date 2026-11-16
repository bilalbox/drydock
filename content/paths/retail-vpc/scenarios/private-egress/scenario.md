Microservices and OpenSearch nodes run inside `retaildemostore-private-1` and `retaildemostore-private-2` with no public IP addresses.

To pull container images or reach external endpoints without exposing private workloads directly, each Availability Zone needs its own NAT Gateway in the corresponding public subnet and its own private route table (`retaildemostore-private-rt-1` and `retaildemostore-private-rt-2`) sending `0.0.0.0/0` through that AZ's NAT Gateway.
