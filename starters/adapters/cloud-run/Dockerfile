FROM node:18-bullseye-slim AS build-env

COPY . /app
WORKDIR /app

# It is recommended that you only install production dependencies with
# `npm i --omit=dev`. You may need to check which dependencies are missing
RUN npm i
RUN npm run build


# A light-weight image for running the app
FROM gcr.io/distroless/nodejs18-debian11

WORKDIR /app
COPY --from=build-env /app/node_modules ./node_modules

# After running `npm run build` you will have 2 build folders.
# - The `dist` folder will be created including all the static files.
# - The `server` folder will be created including all node server files.
COPY --from=build-env /app/server ./server
COPY --from=build-env /app/dist ./dist

CMD ["server/entry.cloud-run.js"]
