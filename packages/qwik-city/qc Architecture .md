# Qwik City in Production: Architecture and Request Processing

## Overview

Qwik City is the meta-framework for Qwik that handles routing, layouts, and server-side functionality. In production mode, Qwik City operates through adapter-based middleware that processes incoming requests, serves static assets, and handles server-side rendering (SSR) or serves pre-generated static content.

## Adapter Architecture

Qwik City uses adapters to integrate with different hosting environments (Netlify, Cloudflare, Azure, Node.js, etc.). While each adapter is tailored to its specific platform, they all share a common architecture and request processing flow.

### What Adapters Do

1. **Configure Environment Settings**: Set up environment-specific configurations (origins, paths, etc.)
2. **Generate Deployment Assets**: Create platform-specific files needed for deployment
3. **Manage Static and Dynamic Content**: Distinguish between static assets and dynamic routes
4. **Handle SSR and SSG**: Implement server-side rendering or static site generation based on configuration

## Request Processing Flow

When a request comes into a Qwik City application in production, it follows this general flow:

1. **Request Received**: The platform-specific entry point (e.g., serverless function, edge function) receives the HTTP request

2. **Static Path Check**: The middleware checks if the requested path corresponds to a static asset:

   ```typescript
   function isStaticPath(method, url) {
     // Check if path is a static asset (build files, assets directory, etc.)
     // Return true if static, false if dynamic
   }
   ```

3. **Static Asset Serving**:

   - If the path is for a static asset (CSS, JS, images, or pre-rendered HTML)
   - Returns the file directly from the file system or content delivery network

4. **Dynamic Route Processing**:

   - If not a static asset, the request is processed as a dynamic route
   - The middleware loads the Qwik City plan (routing metadata)
   - Resolves the appropriate route handler based on the URL

5. **Server-Side Rendering**:

   - The middleware executes the route's server functions
   - Fetches any required data
   - Renders the component tree to HTML

6. **Response Generation**:

   - Combines the rendered HTML with necessary Qwik framework code
   - Injects any required serialized state
   - Sets appropriate headers (caching, content-type, etc.)

7. **Error Handling**:
   - If a route is not found, returns a custom 404 page
   - For server errors, returns appropriate error responses

## Static Site Generation (SSG)

Qwik City supports static site generation as part of the build process:

1. **SSG Configuration**: Routes to be pre-rendered are specified in the adapter options

2. **Path Collection**: The build process identifies all potential static paths:

   ```typescript
   const staticPaths = new Set([
     /* collected paths */
   ]);
   ```

3. **Pre-rendering**: Each path is rendered to HTML during build time

4. **Output Generation**: Static files are written to the output directory:
   - HTML files
   - JSON data files (q-data.json)
   - Assets

## Request-Response Cycle Example

Here's a conceptual example of how a request flows through Qwik City middleware:

```
Client Request → Platform Entry Point → Middleware
  ↓
Is Static Path? → Yes → Serve Static File
  ↓ No
Find Route → Execute Route Handlers → Render Components
  ↓
Generate HTML Response → Return to Client
```

## Optimization Features

1. **Efficient Static/Dynamic Determination**: Fast path detection using pre-computed maps
2. **Cached Rendering**: Pre-rendered content for static paths
3. **Partial Hydration**: Only required components are made interactive on the client
4. **Streaming Support**: Some adapters support streaming responses for faster time-to-first-byte

## Adaptation Layer

Each adapter customizes this general flow for its specific platform requirements:

- **File Formats**: Some platforms require ESM, others CommonJS
- **Deployment Artifacts**: Platform-specific manifests, function definitions, etc.
- **Environment Variables**: Platform-specific configuration variables
- **Middleware Integration**: How the middleware hooks into the platform's request handling
