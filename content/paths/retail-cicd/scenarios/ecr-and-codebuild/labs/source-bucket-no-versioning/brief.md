CodePipeline runs stopped distinguishing consecutive `products-source.zip` uploads in `retaildemostore-pipeline-source`, and older archive versions are gone.

Someone changed the bucket in the console during cleanup, and re-applying the current workspace leaves versioning suspended. Restore versioning on `retaildemostore-pipeline-source`, keep all public access blocked, and preserve the `retaildemostore/products` ECR repository.
