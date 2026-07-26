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
    setUrl(undefined);

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

  if (!url) {
    return (
      <div className="loader" role="status" aria-live="polite">
        <span className="loader-spinner" aria-hidden="true" />
        <div className="loader-copy">
          <p className="loader-title">Preparing PDF</p>
          <p className="loader-hint">Rendering {title.toLowerCase()}. This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  return <iframe className="pdf-preview-frame" src={url} title={title} />;
}
