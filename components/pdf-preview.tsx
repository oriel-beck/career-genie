'use client';

import { pdf, type DocumentProps } from '@react-pdf/renderer';
import { useEffect, useRef, useState, type ReactElement } from 'react';

function OpenInNewTabIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function PdfPreview({
  document,
  title,
  heading,
}: {
  document: ReactElement<DocumentProps>;
  title: string;
  heading: string;
}) {
  const [preview, setPreview] = useState<
    { document: ReactElement<DocumentProps>; url: string } | undefined
  >(undefined);
  const urlRef = useRef<string | undefined>(undefined);
  const url = preview?.document === document ? preview.url : undefined;

  useEffect(() => {
    let cancelled = false;

    void pdf(document).toBlob().then((blob) => {
      if (cancelled) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const nextUrl = URL.createObjectURL(blob);
      urlRef.current = nextUrl;
      setPreview({ document, url: nextUrl });
    });

    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = undefined;
    };
  }, [document]);

  return (
    <>
      <div className="pdf-preview-header">
        <h2>{heading}</h2>
        {url ? (
          <a
            className="pdf-preview-open"
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in new tab"
            title="Open in new tab"
          >
            <OpenInNewTabIcon />
          </a>
        ) : null}
      </div>
      {!url ? (
        <div className="loader" role="status" aria-live="polite">
          <span className="loader-spinner" aria-hidden="true" />
          <div className="loader-copy">
            <p className="loader-title">Preparing PDF</p>
            <p className="loader-hint">Rendering {title.toLowerCase()}. This usually takes a few seconds.</p>
          </div>
        </div>
      ) : (
        <iframe className="pdf-preview-frame" src={url} title={title} />
      )}
    </>
  );
}
