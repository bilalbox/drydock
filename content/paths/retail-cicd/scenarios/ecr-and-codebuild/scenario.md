Each Retail Demo Store microservice builds its container image with AWS CodeBuild and pushes it to a private Amazon ECR repository.

Create the `retaildemostore/products` ECR repository and the S3 source/artifact buckets first, then configure the CodeBuild project and its IAM service role.
