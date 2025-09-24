import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OutgoingHttpHeaders, OutgoingHttpHeader } from 'node:http';

enum State {
  /** Collecting content until <body> is found */
  BUFFERING,
  /** Transforming the head portion */
  PROCESSING_HEAD,
  /** Streaming transformed content until </body> */
  STREAMING_BODY,
  /** Passing through content unchanged */
  PASSTHROUGH,
}

/**
 * Patches a response object to intercept HTML streams and transform them using Vite's
 * transformIndexHtml.
 */
class HtmlTransformPatcher {
  private state: State = State.BUFFERING;
  private buffer = '';
  private headInnerIndex = -1;
  private bodyInnerIndex = -1;
  private isHtmlResponse = false;

  private bodyPostContent = '';
  private response: ServerResponse;
  private server: ViteDevServer;
  private request: IncomingMessage;
  private origWrite: ServerResponse['write'];
  private origEnd: ServerResponse['end'];
  private origSetHeader: ServerResponse['setHeader'];
  private origWriteHead: ServerResponse['writeHead'];

  private processingPromise: Promise<void> | null = null;

  constructor(req: IncomingMessage, res: ServerResponse, server: ViteDevServer) {
    this.request = req;
    this.response = res;
    this.server = server;
    this.origWrite = this.response.write.bind(this.response);
    this.origEnd = this.response.end.bind(this.response);
    this.origSetHeader = this.response.setHeader.bind(this.response);
    this.origWriteHead = this.response.writeHead.bind(this.response);

    // Now overwrite methods to detect HTML content type and intercept writes

    this.response.setHeader = (name: string, value: string | number | string[]) => {
      if (name.toLowerCase() === 'content-type') {
        const contentType = String(value).toLowerCase();
        this.isHtmlResponse = contentType.includes('text/html');
      }
      return this.origSetHeader(name, value);
    };

    this.response.writeHead = (
      statusCode: number,
      statusMessage?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
      headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]
    ) => {
      if (typeof statusMessage === 'object' && statusMessage !== null) {
        headers = statusMessage;
        statusMessage = undefined;
      }
      if (headers && typeof headers === 'object') {
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() === 'content-type') {
            const contentType = String(value).toLowerCase();
            this.isHtmlResponse = contentType.includes('text/html');
          }
        }
      }
      return this.origWriteHead(statusCode, statusMessage as any, headers as any);
    };

    this.response.write = this.handleWrite.bind(this);

    this.response.end = (chunk?: any, encoding?: any, callback?: any): ServerResponse => {
      this.handleEnd(chunk, encoding, callback).catch((error) => {
        console.error('Error in handleEnd:', error);
        // Fallback: end the original response
        this.transitionToPassthrough();
        this.origEnd(chunk, encoding, callback);
      });

      return this.response;
    };
  }

  private handleWrite(chunk: string | Buffer | ArrayBufferLike, encoding?: any, callback?: any) {
    if (!this.isHtmlResponse || this.state === State.PASSTHROUGH) {
      return this.origWrite(chunk, encoding, callback);
    }

    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    // Handle different chunk types properly
    let data: string;
    if (
      chunk instanceof ArrayBuffer ||
      chunk instanceof Uint8Array ||
      chunk instanceof Uint16Array ||
      chunk instanceof Uint32Array
    ) {
      data = new TextDecoder().decode(chunk);
    } else if (Buffer.isBuffer(chunk)) {
      data = chunk.toString(encoding || 'utf8');
    } else if (typeof chunk === 'string') {
      data = chunk;
    } else {
      data = chunk?.toString() || '';
    }
    this.buffer += data;

    switch (this.state) {
      case State.BUFFERING:
        // Note that we scan the entire buffer every time, in case the <head> or <body> tags are split across chunks
        if (this.headInnerIndex === -1) {
          const headMatch = this.buffer.match(/<head[^>]*>/i);
          if (headMatch) {
            const headOuterIndex = this.buffer.indexOf(headMatch[0]);
            this.headInnerIndex = headOuterIndex + headMatch[0].length;
          }
        }
        if (this.headInnerIndex !== -1) {
          const bodyMatch = this.buffer.slice(this.headInnerIndex).match(/<body[^>]*>/i);
          if (bodyMatch) {
            this.state = State.PROCESSING_HEAD;
            const bodyOuterIndex = this.buffer.indexOf(bodyMatch[0]);
            this.bodyInnerIndex = bodyOuterIndex + bodyMatch[0].length;
            this.processingPromise = this.processHead();
          }
        }
        break;

      case State.PROCESSING_HEAD:
        break;

      case State.STREAMING_BODY:
        this.handleStreamingBodyState();
        break;

      default:
        throw new Error(`Invalid state: ${this.state}`);
    }
    callback?.();
    return true;
  }

  private async processHead() {
    try {
      // We can't pass the actual head to vite because it strips some scripts and then the DOM doesn't match the vdom positions
      const fakeHtml = '<html><head>[FAKE_HEAD]</head><body>[FAKE_BODY]</body></html>';
      // Let Vite transform the HTML
      const transformedHtml = await this.server.transformIndexHtml(
        this.request.url || '/',
        fakeHtml
      );

      // Extract the pre and post head and body content. For now, ignore attributes added to the tags
      // If attributes are needed later, put them after the : attribute on qwik's tags
      const fakeHeadIndex = transformedHtml.indexOf('[FAKE_HEAD]');
      const fakeHeadCloseIndex = transformedHtml.indexOf('</head>', fakeHeadIndex);
      if (fakeHeadIndex === -1 || fakeHeadCloseIndex === -1) {
        throw new Error('Transformed HTML does not contain [FAKE_HEAD]...</head>');
      }
      const headPreContent = transformedHtml
        .slice('<html><head>'.length, fakeHeadIndex)
        // remove new line after <script type="module" src="/@vite/client"></script>
        .trim();
      const headPostContent = transformedHtml.slice(
        fakeHeadIndex + '[FAKE_HEAD]'.length,
        fakeHeadCloseIndex
      );
      const fakeBodyStartIndex = transformedHtml.indexOf('<body>', fakeHeadCloseIndex);
      const fakeBodyIndex = transformedHtml.indexOf('[FAKE_BODY]', fakeBodyStartIndex);
      const fakeBodyEndIndex = transformedHtml.indexOf('</body>', fakeBodyIndex);
      if (fakeBodyIndex === -1 || fakeBodyEndIndex === -1) {
        throw new Error('Transformed HTML does not contain [FAKE_BODY]...</body>');
      }
      const bodyPreContent = transformedHtml.slice(
        fakeBodyStartIndex + '<body>'.length,
        fakeBodyIndex
      );
      this.bodyPostContent = transformedHtml.slice(
        fakeBodyIndex + '[FAKE_BODY]'.length,
        fakeBodyEndIndex
      );
      // Now inject the head pre and post content and the body pre into the buffered content
      // Note that the head tag has attributes
      const headCloseIndex = this.buffer.indexOf('</head>', this.headInnerIndex);
      if (headCloseIndex === -1) {
        throw new Error('Buffered HTML does not contain </head>');
      }

      this.buffer =
        this.buffer.slice(0, this.headInnerIndex) +
        headPreContent +
        this.buffer.slice(this.headInnerIndex, headCloseIndex) +
        headPostContent +
        this.buffer.slice(headCloseIndex, this.bodyInnerIndex) +
        bodyPreContent +
        this.buffer.slice(this.bodyInnerIndex);

      if (this.bodyPostContent.length > 0) {
        this.state = State.STREAMING_BODY;
        this.handleStreamingBodyState();
        return;
      }

      this.transitionToPassthrough();
      return;
    } catch (error) {
      console.error('Error transforming HTML:', error);
      this.transitionToPassthrough();
      return;
    }
  }

  private handleStreamingBodyState() {
    const bodyEndMatch = this.buffer.match(/<\/body>/i);

    if (bodyEndMatch) {
      const bodyEndPos = this.buffer.indexOf(bodyEndMatch[0]);
      this.buffer =
        this.buffer.slice(0, bodyEndPos) + this.bodyPostContent + this.buffer.slice(bodyEndPos);

      this.transitionToPassthrough();
      return;
    }

    // keep the last 6 characters of the buffer to detect `</body>`
    this.flushBuffer(6);
  }

  private transitionToPassthrough() {
    this.state = State.PASSTHROUGH;
    this.flushBuffer();
  }

  private flushBuffer(keep: number = 0): void {
    if (this.buffer.length > keep) {
      if (keep > 0) {
        this.origWrite(this.buffer.slice(0, -keep));
        this.buffer = this.buffer.slice(-keep);
      } else {
        this.origWrite(this.buffer);
        this.buffer = '';
      }
    }
  }

  private async handleEnd(chunk?: any, encoding?: any, callback?: any): Promise<void> {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }
    if (chunk) {
      this.handleWrite(chunk, encoding);
    }
    await this.processingPromise;
    // just in case
    this.flushBuffer();

    this.origEnd(callback);
  }
}

/** Patches a response to enable HTML transformation using Vite's transformIndexHtml */
export function wrapResponseForHtmlTransform(
  request: IncomingMessage,
  response: ServerResponse,
  server: ViteDevServer
): ServerResponse {
  new HtmlTransformPatcher(request, response, server);
  return response;
}
