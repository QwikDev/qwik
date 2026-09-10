## AWS Lambda

This app deploys to AWS behind CloudFront: S3 for static assets, a [Lambda Function URL](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html) for server-side rendering. Plain CloudFormation, no third-party deploy framework.

```shell
export DEPLOYMENT_BUCKET="qwik-deployment-bucket"
make setup-deployment # once, to hold the packaged template

export STACK_NAME="qwik-stack"
export STATIC_BUCKET="qwik-static"
make deploy
```
