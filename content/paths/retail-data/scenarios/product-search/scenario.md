The Search microservice serves product queries inside the store’s VPC and keeps its index synchronized from catalog changes.

Set up the VPC security group (`retaildemostore-opensearch-sg`) and KMS encryption key (`alias/retaildemostore-search`) for search index storage first, then create the Search task IAM role and Kinesis stream that feeds catalog updates.
