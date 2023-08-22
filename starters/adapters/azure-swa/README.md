## Create your Static Web App on Azure

1. Follow [this](https://learn.microsoft.com/en-us/azure/static-web-apps/overview) guide to create a Static Web App. This guide will also detail how to generate a github action or Azure Pipeline (see "Quickstarts" section)

2. If you're using github actions, make sure to add skip_api_build with true value.

```yml
app_location: "/"
api_location: "azure-functions"
output_location: "dist"
skip_api_build: true # <--- add this line
###### End of Repository/Build Configurations ######
```
