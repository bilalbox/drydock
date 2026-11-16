The ECR repository, pipeline S3 buckets, and `retaildemostore-products-build` CodeBuild project are already defined in `main.tf`.

1. Declare an `aws_iam_role` named `codepipeline` with `name = "retaildemostore-codepipeline-role"` assumable by `codepipeline.amazonaws.com`.
2. Attach an `aws_iam_role_policy` granting `s3:*`, `codebuild:StartBuild`, `codebuild:BatchGetBuilds`, and `iam:PassRole`.
3. Declare an `aws_codepipeline` named `products` with `name = "retaildemostore-products-pipeline"`, `role_arn = aws_iam_role.codepipeline.arn`, `artifact_store` pointing to `aws_s3_bucket.artifacts.bucket` (`type = "S3"`), a `Source` stage (`S3` provider reading `products-source.zip` from `aws_s3_bucket.source.bucket` with `PollForSourceChanges = "false"`), and a `Build` stage (`CodeBuild` provider targeting `aws_codebuild_project.products.name`).
4. Run `terraform apply` in the Terminal, then press Check.
