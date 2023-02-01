FROM node:18-bullseye-slim AS build-env

COPY . /app
WORKDIR /app

# It is recommended that you only install production dependencies with
# `npm i --omit=dev`. You may need to check which dependencies are missing
RUN npm i


# A light-weight image for running the app
FROM gcr.io/distroless/nodejs18-debian11

COPY --from=build-env /app /app
WORKDIR /app

CMD ["server/entry.cloud-run.js"]
