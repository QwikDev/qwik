---
title: \@builder.io/qwik-city/middleware/request-handler API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/request-handler

## AbortMessage

```typescript
export declare class AbortMessage
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/redirect-handler.ts)

## append

Appends a `Response` cookie header using the `Set-Cookie` header.

The difference between `set()` and `append()` is that if the specified header already exists, `set()` will overwrite the existing value with the new one, whereas `append()` will append the new value onto the end of the set of values.

```typescript
append(name: string, value: string | number | Record<string, any>, options?: CookieOptions): void;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

name

</td><td>

string

</td><td>

</td></tr>
<tr><td>

value

</td><td>

string \| number \| Record&lt;string, any&gt;

</td><td>

</td></tr>
<tr><td>

options

</td><td>

[CookieOptions](#cookieoptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

void

## CacheControl

```typescript
export type CacheControl =
  | CacheControlOptions
  | number
  | "day"
  | "week"
  | "month"
  | "year"
  | "no-cache"
  | "immutable"
  | "private";
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## ClientConn

```typescript
export interface ClientConn
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[country?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[ip?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## Cookie

```typescript
export interface Cookie
```

<table><thead><tr><th>

Method

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[append(name, value, options)](#cookie-append)

</td><td>

Appends a `Response` cookie header using the `Set-Cookie` header.

The difference between `set()` and `append()` is that if the specified header already exists, `set()` will overwrite the existing value with the new one, whereas `append()` will append the new value onto the end of the set of values.

</td></tr>
<tr><td>

[delete(name, options)](#cookie-delete)

</td><td>

Deletes cookie value by name using the `Response` cookie header.

</td></tr>
<tr><td>

[get(name)](#cookie-get)

</td><td>

Gets a `Request` cookie header value by name.

</td></tr>
<tr><td>

[getAll()](#cookie-getall)

</td><td>

Gets all `Request` cookie headers.

</td></tr>
<tr><td>

[has(name)](#cookie-has)

</td><td>

Checks if the `Request` cookie header name exists.

</td></tr>
<tr><td>

[headers()](#cookie-headers)

</td><td>

Returns an array of all the set `Response` `Set-Cookie` header values.

</td></tr>
<tr><td>

[set(name, value, options)](#cookie-set)

</td><td>

Sets a `Response` cookie header using the `Set-Cookie` header.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## CookieOptions

https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie

```typescript
export interface CookieOptions
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[domain?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ Defines the host to which the cookie will be sent. If omitted, this attribute defaults to the host of the current document URL, not including subdomains.

</td></tr>
<tr><td>

[expires?](#)

</td><td>

</td><td>

Date \| string

</td><td>

_(Optional)_ Indicates the maximum lifetime of the cookie as an HTTP-date timestamp. If both `expires` and `maxAge` are set, `maxAge` has precedence.

</td></tr>
<tr><td>

[httpOnly?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Forbids JavaScript from accessing the cookie, for example, through the `document.cookie` property.

</td></tr>
<tr><td>

[maxAge?](#)

</td><td>

</td><td>

number \| [number, 'seconds' \| 'minutes' \| 'hours' \| 'days' \| 'weeks']

</td><td>

_(Optional)_ Indicates the number of seconds until the cookie expires. A zero or negative number will expire the cookie immediately. If both `expires` and `maxAge` are set, `maxAge` has precedence. You can also use the array syntax to set the max-age using minutes, hours, days or weeks. For example, `{ maxAge: [3, "days"] }` would set the cookie to expire in 3 days.

</td></tr>
<tr><td>

[path?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ Indicates the path that must exist in the requested URL for the browser to send the Cookie header.

</td></tr>
<tr><td>

[sameSite?](#)

</td><td>

</td><td>

'strict' \| 'lax' \| 'none' \| 'Strict' \| 'Lax' \| 'None' \| boolean

</td><td>

_(Optional)_ Controls whether or not a cookie is sent with cross-site requests, providing some protection against cross-site request forgery attacks (CSRF).

</td></tr>
<tr><td>

[secure?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Indicates that the cookie is sent to the server only when a request is made with the `https:` scheme (except on localhost)

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## CookieValue

```typescript
export interface CookieValue
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[json](#)

</td><td>

</td><td>

&lt;T = unknown&gt;() =&gt; T

</td><td>

</td></tr>
<tr><td>

[number](#)

</td><td>

</td><td>

() =&gt; number

</td><td>

</td></tr>
<tr><td>

[value](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## data

```typescript
data: T;
```

## DeferReturn

```typescript
export type DeferReturn<T> = () => Promise<T>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## delete

Deletes cookie value by name using the `Response` cookie header.

```typescript
delete(name: string, options?: Pick<CookieOptions, 'path' | 'domain' | 'sameSite'>): void;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

name

</td><td>

string

</td><td>

</td></tr>
<tr><td>

options

</td><td>

Pick&lt;[CookieOptions](#cookieoptions), 'path' \| 'domain' \| 'sameSite'&gt;

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

void

## EnvGetter

```typescript
export interface EnvGetter
```

<table><thead><tr><th>

Method

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[get(key)](#)

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## get

Gets a `Request` cookie header value by name.

```typescript
get(name: string): CookieValue | null;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

name

</td><td>

string

</td><td>

</td></tr>
</tbody></table>
**Returns:**

[CookieValue](#cookievalue) \| null

## getAll

Gets all `Request` cookie headers.

```typescript
getAll(): Record<string, CookieValue>;
```

**Returns:**

Record&lt;string, [CookieValue](#cookievalue)&gt;

## getErrorHtml

```typescript
export declare function getErrorHtml(status: number, e: any): string;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

status

</td><td>

number

</td><td>

</td></tr>
<tr><td>

e

</td><td>

any

</td><td>

</td></tr>
</tbody></table>
**Returns:**

string

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/error-handler.ts)

## has

Checks if the `Request` cookie header name exists.

```typescript
has(name: string): boolean;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

name

</td><td>

string

</td><td>

</td></tr>
</tbody></table>
**Returns:**

boolean

## headers

Returns an array of all the set `Response` `Set-Cookie` header values.

```typescript
headers(): string[];
```

**Returns:**

string[]

## mergeHeadersCookies

```typescript
mergeHeadersCookies: (headers: Headers, cookies: CookieInterface) => Headers;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

headers

</td><td>

Headers

</td><td>

</td></tr>
<tr><td>

cookies

</td><td>

[CookieInterface](#cookie)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

Headers

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/cookie.ts)

## RedirectMessage

```typescript
export declare class RedirectMessage extends AbortMessage
```

**Extends:** [AbortMessage](#abortmessage)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/redirect-handler.ts)

## RequestEvent

```typescript
export interface RequestEvent<PLATFORM = QwikCityPlatform> extends RequestEventCommon<PLATFORM>
```

**Extends:** [RequestEventCommon](#requesteventcommon)&lt;PLATFORM&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[exited](#)

</td><td>

`readonly`

</td><td>

boolean

</td><td>

True if the middleware chain has finished executing.

</td></tr>
<tr><td>

[getWritableStream](#)

</td><td>

`readonly`

</td><td>

() =&gt; WritableStream&lt;Uint8Array&gt;

</td><td>

Low-level access to write to the HTTP response stream. Once `getWritableStream()` is called, the status and headers can no longer be modified and will be sent over the network.

</td></tr>
<tr><td>

[headersSent](#)

</td><td>

`readonly`

</td><td>

boolean

</td><td>

True if headers have been sent, preventing any more headers from being set.

</td></tr>
<tr><td>

[next](#)

</td><td>

`readonly`

</td><td>

() =&gt; Promise&lt;void&gt;

</td><td>

Invoke the next middleware function in the chain.

NOTE: Ensure that the call to `next()` is `await`ed.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## RequestEventAction

```typescript
export interface RequestEventAction<PLATFORM = QwikCityPlatform> extends RequestEventCommon<PLATFORM>
```

**Extends:** [RequestEventCommon](#requesteventcommon)&lt;PLATFORM&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[fail](#)

</td><td>

</td><td>

&lt;T extends Record&lt;string, any&gt;&gt;(status: number, returnData: T) =&gt; FailReturn&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## RequestEventBase

```typescript
export interface RequestEventBase<PLATFORM = QwikCityPlatform>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[basePathname](#)

</td><td>

`readonly`

</td><td>

string

</td><td>

The base pathname of the request, which can be configured at build time. Defaults to `/`.

</td></tr>
<tr><td>

[cacheControl](#)

</td><td>

`readonly`

</td><td>

(cacheControl: [CacheControl](#cachecontrol), target?: CacheControlTarget) =&gt; void

</td><td>

Convenience method to set the Cache-Control header. Depending on your CDN, you may want to add another cacheControl with the second argument set to `CDN-Cache-Control` or any other value (we provide the most common values for auto-complete, but you can use any string you want).

See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control and https://qwik.dev/docs/caching/\#CDN-Cache-Controls for more information.

</td></tr>
<tr><td>

[clientConn](#)

</td><td>

`readonly`

</td><td>

[ClientConn](#clientconn)

</td><td>

Provides information about the client connection, such as the IP address and the country the request originated from.

</td></tr>
<tr><td>

[cookie](#)

</td><td>

`readonly`

</td><td>

[Cookie](#cookie)

</td><td>

HTTP request and response cookie. Use the `get()` method to retrieve a request cookie value. Use the `set()` method to set a response cookie value.

https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies

</td></tr>
<tr><td>

[env](#)

</td><td>

`readonly`

</td><td>

[EnvGetter](#envgetter)

</td><td>

Platform provided environment variables.

</td></tr>
<tr><td>

[headers](#)

</td><td>

`readonly`

</td><td>

Headers

</td><td>

HTTP response headers. Notice it will be empty until you first add a header. If you want to read the request headers, use `request.headers` instead.

https://developer.mozilla.org/en-US/docs/Glossary/Response\_header

</td></tr>
<tr><td>

[method](#)

</td><td>

`readonly`

</td><td>

string

</td><td>

HTTP request method.

https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods

</td></tr>
<tr><td>

[params](#)

</td><td>

`readonly`

</td><td>

Readonly&lt;Record&lt;string, string&gt;&gt;

</td><td>

URL path params which have been parsed from the current url pathname segments. Use `query` to instead retrieve the query string search params.

</td></tr>
<tr><td>

[parseBody](#)

</td><td>

`readonly`

</td><td>

() =&gt; Promise&lt;unknown&gt;

</td><td>

This method will check the request headers for a `Content-Type` header and parse the body accordingly. It supports `application/json`, `application/x-www-form-urlencoded`, and `multipart/form-data` content types.

If the `Content-Type` header is not set, it will return `null`.

</td></tr>
<tr><td>

[pathname](#)

</td><td>

`readonly`

</td><td>

string

</td><td>

URL pathname. Does not include the protocol, domain, query string (search params) or hash.

https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname

</td></tr>
<tr><td>

[platform](#)

</td><td>

`readonly`

</td><td>

PLATFORM

</td><td>

Platform specific data and functions

</td></tr>
<tr><td>

[query](#)

</td><td>

`readonly`

</td><td>

URLSearchParams

</td><td>

URL Query Strings (URL Search Params). Use `params` to instead retrieve the route params found in the url pathname.

https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams

</td></tr>
<tr><td>

[request](#)

</td><td>

`readonly`

</td><td>

Request

</td><td>

HTTP request information.

</td></tr>
<tr><td>

[sharedMap](#)

</td><td>

`readonly`

</td><td>

Map&lt;string, any&gt;

</td><td>

Shared Map across all the request handlers. Every HTTP request will get a new instance of the shared map. The shared map is useful for sharing data between request handlers.

</td></tr>
<tr><td>

[signal](#)

</td><td>

`readonly`

</td><td>

AbortSignal

</td><td>

Request's AbortSignal (same as `request.signal`). This signal indicates that the request has been aborted.

</td></tr>
<tr><td>

[url](#)

</td><td>

`readonly`

</td><td>

URL

</td><td>

HTTP request URL.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## RequestEventCommon

```typescript
export interface RequestEventCommon<PLATFORM = QwikCityPlatform> extends RequestEventBase<PLATFORM>
```

**Extends:** [RequestEventBase](#requesteventbase)&lt;PLATFORM&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[error](#)

</td><td>

`readonly`

</td><td>

&lt;T = any&gt;(statusCode: ErrorCodes, message: T) =&gt; [ServerError](#servererror)&lt;T&gt;

</td><td>

When called, the response will immediately end with the given status code. This could be useful to end a response with `404`, and use the 404 handler in the routes directory. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Status for which status code should be used.

</td></tr>
<tr><td>

[exit](#)

</td><td>

`readonly`

</td><td>

() =&gt; [AbortMessage](#abortmessage)

</td><td>

</td></tr>
<tr><td>

[html](#)

</td><td>

`readonly`

</td><td>

(statusCode: StatusCodes, html: string) =&gt; [AbortMessage](#abortmessage)

</td><td>

Convenience method to send an HTML body response. The response will be automatically set the `Content-Type` header to`text/html; charset=utf-8`. An `html()` response can only be called once.

</td></tr>
<tr><td>

[json](#)

</td><td>

`readonly`

</td><td>

(statusCode: StatusCodes, data: any) =&gt; [AbortMessage](#abortmessage)

</td><td>

Convenience method to JSON stringify the data and send it in the response. The response will be automatically set the `Content-Type` header to `application/json; charset=utf-8`. A `json()` response can only be called once.

</td></tr>
<tr><td>

[locale](#)

</td><td>

`readonly`

</td><td>

(local?: string) =&gt; string

</td><td>

Which locale the content is in.

The locale value can be retrieved from selected methods using `getLocale()`:

</td></tr>
<tr><td>

[redirect](#)

</td><td>

`readonly`

</td><td>

(statusCode: RedirectCode, url: string) =&gt; [RedirectMessage](#redirectmessage)

</td><td>

URL to redirect to. When called, the response will immediately end with the correct redirect status and headers.

https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections

</td></tr>
<tr><td>

[send](#)

</td><td>

`readonly`

</td><td>

SendMethod

</td><td>

Send a body response. The `Content-Type` response header is not automatically set when using `send()` and must be set manually. A `send()` response can only be called once.

</td></tr>
<tr><td>

[status](#)

</td><td>

`readonly`

</td><td>

(statusCode?: StatusCodes) =&gt; number

</td><td>

HTTP response status code. Sets the status code when called with an argument. Always returns the status code, so calling `status()` without an argument will can be used to return the current status code.

https://developer.mozilla.org/en-US/docs/Web/HTTP/Status

</td></tr>
<tr><td>

[text](#)

</td><td>

`readonly`

</td><td>

(statusCode: StatusCodes, text: string) =&gt; [AbortMessage](#abortmessage)

</td><td>

Convenience method to send an text body response. The response will be automatically set the `Content-Type` header to`text/plain; charset=utf-8`. An `text()` response can only be called once.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## RequestEventLoader

```typescript
export interface RequestEventLoader<PLATFORM = QwikCityPlatform> extends RequestEventAction<PLATFORM>
```

**Extends:** [RequestEventAction](#requesteventaction)&lt;PLATFORM&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[defer](#)

</td><td>

</td><td>

&lt;T&gt;(returnData: Promise&lt;T&gt; \| (() =&gt; Promise&lt;T&gt;)) =&gt; [DeferReturn](#deferreturn)&lt;T&gt;

</td><td>

</td></tr>
<tr><td>

[resolveValue](#)

</td><td>

</td><td>

[ResolveValue](#resolvevalue)

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## requestHandler

```typescript
export type RequestHandler<PLATFORM = QwikCityPlatform> = (
  ev: RequestEvent<PLATFORM>,
) => Promise<void> | void;
```

**References:** [RequestEvent](#requestevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/request-handler.ts)

## RequestHandler

```typescript
export type RequestHandler<PLATFORM = QwikCityPlatform> = (
  ev: RequestEvent<PLATFORM>,
) => Promise<void> | void;
```

**References:** [RequestEvent](#requestevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## ResolveSyncValue

```typescript
export interface ResolveSyncValue
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## ResolveValue

```typescript
export interface ResolveValue
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## ServerError

```typescript
export declare class ServerError<T = any> extends Error
```

**Extends:** Error

<table><thead><tr><th>

Constructor

</th><th>

Modifiers

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[(constructor)(status, data)](#)

</td><td>

</td><td>

Constructs a new instance of the `ServerError` class

</td></tr>
</tbody></table>

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[data](#servererror-data)

</td><td>

</td><td>

T

</td><td>

</td></tr>
<tr><td>

[status](#servererror-status)

</td><td>

</td><td>

number

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/error-handler.ts)

## ServerRenderOptions

```typescript
export interface ServerRenderOptions extends RenderOptions
```

**Extends:** RenderOptions

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[checkOrigin?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Protection against cross-site request forgery (CSRF) attacks.

When `true`, for every incoming POST, PUT, PATCH, or DELETE form submissions, the request origin is checked to match the server's origin.

Be careful when disabling this option as it may lead to CSRF attacks.

Defaults to `true`.

</td></tr>
<tr><td>

[qwikCityPlan](#)

</td><td>

</td><td>

QwikCityPlan

</td><td>

</td></tr>
<tr><td>

[render](#)

</td><td>

</td><td>

Render

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## ServerRequestEvent

Request event created by the server.

```typescript
export interface ServerRequestEvent<T = unknown>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[env](#)

</td><td>

</td><td>

[EnvGetter](#envgetter)

</td><td>

</td></tr>
<tr><td>

[getClientConn](#)

</td><td>

</td><td>

() =&gt; [ClientConn](#clientconn)

</td><td>

</td></tr>
<tr><td>

[getWritableStream](#)

</td><td>

</td><td>

[ServerResponseHandler](#serverresponsehandler)&lt;T&gt;

</td><td>

</td></tr>
<tr><td>

[locale](#)

</td><td>

</td><td>

string \| undefined

</td><td>

</td></tr>
<tr><td>

[mode](#)

</td><td>

</td><td>

[ServerRequestMode](#serverrequestmode)

</td><td>

</td></tr>
<tr><td>

[platform](#)

</td><td>

</td><td>

QwikCityPlatform

</td><td>

</td></tr>
<tr><td>

[request](#)

</td><td>

</td><td>

Request

</td><td>

</td></tr>
<tr><td>

[url](#)

</td><td>

</td><td>

URL

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## ServerRequestMode

```typescript
export type ServerRequestMode = "dev" | "static" | "server";
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## ServerResponseHandler

```typescript
export type ServerResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  cookies: Cookie,
  resolve: (response: T) => void,
  requestEv: RequestEventInternal,
) => WritableStream<Uint8Array>;
```

**References:** [Cookie](#cookie)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/request-handler/types.ts)

## set

Sets a `Response` cookie header using the `Set-Cookie` header.

```typescript
set(name: string, value: string | number | Record<string, any>, options?: CookieOptions): void;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

name

</td><td>

string

</td><td>

</td></tr>
<tr><td>

value

</td><td>

string \| number \| Record&lt;string, any&gt;

</td><td>

</td></tr>
<tr><td>

options

</td><td>

[CookieOptions](#cookieoptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

void

## status

```typescript
status: number;
```
