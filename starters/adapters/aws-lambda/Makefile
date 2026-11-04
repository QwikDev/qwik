.PHONY: setup-deployment build deploy

DEPLOYMENT_BUCKET ?= "qwik-deployment-bucket"
STACK_NAME ?= "qwik-stack"

setup-deployment:
	aws s3 mb s3://$(DEPLOYMENT_BUCKET)

build:
	npm run build

deploy: build
	# `dist` ships next to `server` here so the framework's static-file
	# fallback can serve anything CloudFront doesn't route to S3.
	rm -rf cloudformation/lambda
	mkdir -p cloudformation/lambda/server cloudformation/dist
	cp -r server/. cloudformation/lambda/server/
	cp -r dist cloudformation/lambda/dist

	aws cloudformation package \
		--template-file cloudformation/template.yaml \
		--output-template-file cloudformation/dist/template.yaml \
		--s3-bucket $(DEPLOYMENT_BUCKET)

	aws cloudformation deploy \
		--template-file cloudformation/dist/template.yaml \
		--stack-name $(STACK_NAME) \
		--capabilities CAPABILITY_IAM

	# CloudFormation names the static bucket (S3 names are global, so a
	# fixed one would clash between users) — read it back from the stack.
	bucket=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) \
		--query "Stacks[0].Outputs[?OutputKey=='StaticBucketName'].OutputValue" \
		--output text); \
	aws s3 sync dist s3://$$bucket --delete \
		--cache-control "public, max-age=31536000, immutable" \
		--exclude "*" --include "build/*" --include "assets/*"; \
	aws s3 sync dist s3://$$bucket --delete \
		--cache-control "public, max-age=0, must-revalidate" \
		--exclude "build/*" --exclude "assets/*"
