The `retaildemostore-products-pipeline` CodePipeline and its `retaildemostore-pipeline-source` S3 bucket are already defined with polling disabled.

Keep the pipeline and buckets intact and wire an event-driven trigger:

- Create an IAM role named `retaildemostore-events-pipeline-role` assumable by `events.amazonaws.com` with permission to call `codepipeline:StartPipelineExecution` on `retaildemostore-products-pipeline`.
- Create an enabled EventBridge rule named `retaildemostore-products-source-trigger` matching `aws.s3` `Object Created` events for bucket `retaildemostore-pipeline-source` and object key `products-source.zip`.
- Target `retaildemostore-products-pipeline` using `retaildemostore-events-pipeline-role`.
