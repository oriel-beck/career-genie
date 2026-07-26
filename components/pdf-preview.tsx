'use client';

import { pdf, type DocumentProps } from '@react-pdf/renderer';
import { useEffect, useRef, useState, type ReactElement } from 'react';

export function PdfPreview({ document, title }: { document: ReactElement<DocumentProps>; title: string }) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const urlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = undefined;

    void pdf(document).toBlob().then((blob) => {
      const nextUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(nextUrl);
      } else {
        urlRef.current = nextUrl;
        setUrl(nextUrl);
      }
    });

    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = undefined;
    };
  }, [document]);

  if (!url) return <p aria-live="polite">Preparing PDF preview…</p>;

  return <iframe src={url} title={title} style={{ border: 0, height: '100%', width: '100%' }} />;
}
