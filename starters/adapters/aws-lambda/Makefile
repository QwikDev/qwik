.PHONY: setup-deployment build deploy

DEPLOYMENT_BUCKET ?= "qwik-deployment-bucket"
STACK_NAME ?= "qwik-stack"
STATIC_BUCKET ?= "qwik-static"

setup-deployment:
	aws s3 mb s3://$(DEPLOYMENT_BUCKET)

build:
	npm run build

deploy: build
	mkdir -p cloudformation/dist

	aws cloudformation package \
		--template-file cloudformation/serverless.yml \
		--output-template-file cloudformation/dist/serverless.yml \
		--s3-bucket $(DEPLOYMENT_BUCKET)

	aws cloudformation deploy \
		--template-file cloudformation/dist/serverless.yml \
		--stack-name $(STACK_NAME) \
		--capabilities CAPABILITY_IAM \
		--parameter-overrides \
			StaticBucketName=$(STATIC_BUCKET)

	# The static bucket is created by the stack above, so it only exists
	# from this point on — on every deploy, first or not.
	aws s3 sync dist s3://$(STATIC_BUCKET)
