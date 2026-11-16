The `retaildemostore/products` ECR repository and the pipeline S3 buckets (`retaildemostore-pipeline-artifacts` and `retaildemostore-pipeline-source`) are already defined.

Keep those resources intact and configure the container build stage:

- Create an IAM role named `retaildemostore-codebuild-role` assumable by `codebuild.amazonaws.com`, with permissions to write CloudWatch Logs, read/write the pipeline S3 buckets, and push images to ECR.
- Create a CodeBuild project named `retaildemostore-products-build` using that role:
  - Source type `CODEPIPELINE` with buildspec `src/products/buildspec.yml`
  - Artifacts type `CODEPIPELINE`
  - Environment type `LINUX_CONTAINER`, compute type `BUILD_GENERAL1_SMALL`, image `aws/codebuild/standard:7.0`, and `privileged_mode` enabled so Docker builds can run
  - Environment variable `IMAGE_REPO_NAME` set to `retaildemostore/products`
