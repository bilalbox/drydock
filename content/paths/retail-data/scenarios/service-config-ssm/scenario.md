Retail Demo Store services read shared configuration—such as the stack bucket, EventBridge bus name, and OpenSearch endpoint—from AWS Systems Manager Parameter Store, while sensitive checkout signing credentials live in AWS Secrets Manager.

Store those shared runtime configuration keys in Parameter Store first, then provision the payment signing secret and its least-privilege read policy in Secrets Manager.
