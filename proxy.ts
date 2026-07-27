import { NextResponse, type NextRequest } from 'next/server';

function csp(nonce: string): string {
  const scriptEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  return [
    "default-src 'self'",
    // wasm-unsafe-eval: yoga-layout (via @react-pdf/renderer) instantiates WASM in-browser
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${scriptEval}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Next sets style="display: none" during streaming; hashes don't cover style attrs
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // data: : yoga loads its WASM binary via fetch(data:application/octet-stream;base64,...)
    "connect-src 'self' https://api.anthropic.com data:",
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp(nonce));
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp(nonce));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
