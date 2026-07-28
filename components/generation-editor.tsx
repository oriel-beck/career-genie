'use client';

import { pdf } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { useState, type ReactElement } from 'react';
import { CoverLetterPdf } from '@/components/cover-letter-pdf';
import { useFeedback } from '@/components/feedback';
import { PdfPreview } from '@/components/pdf-preview';
import { ResumePdf } from '@/components/resume-pdf';
import { db } from '@/lib/db';
import { defaultSettings } from '@/lib/keys';
import { writePdfsToDirectory } from '@/lib/pdf-folder';
import type { Generation } from '@/lib/types';

export function GenerationEditor({ generation }: { generation: Generation }) {
  const { toast } = useFeedback();
  const [pdfBusy, setPdfBusy] = useState<'resume' | 'cover' | 'folder' | null>(null);
  const resume = generation.resume;
  const cover = generation.coverLetter;

  async function download(
    name: string,
    content: ReactElement<DocumentProps>,
    kind: 'resume' | 'cover',
  ) {
    setPdfBusy(kind);
    try {
      const blob = await pdf(content).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not generate PDF.', 'error');
    } finally {
      setPdfBusy(null);
    }
  }

  async function saveBothToFolder() {
    setPdfBusy('folder');
    try {
      const settings = (await db.settings.get(1)) ?? defaultSettings();
      let folderHandle = settings.folderHandle;

      if (!folderHandle) {
        const picker = (
          window as unknown as {
            showDirectoryPicker: (options: {
              mode: 'readwrite';
            }) => Promise<FileSystemDirectoryHandle>;
          }
        ).showDirectoryPicker;
        folderHandle = await picker({ mode: 'readwrite' });
        await db.settings.put({ ...settings, folderHandle, updatedAt: Date.now() });
      }

      const [resumeBlob, coverBlob] = await Promise.all([
        pdf(<ResumePdf document={resume} />).toBlob(),
        pdf(<CoverLetterPdf document={cover} />).toBlob(),
      ]);
      await writePdfsToDirectory(folderHandle, [
        { name: `resume-v${generation.version}.pdf`, blob: resumeBlob },
        { name: `cover-letter-v${generation.version}.pdf`, blob: coverBlob },
      ]);
      toast(`Saved both PDFs to ${folderHandle.name}.`, 'success');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast('Folder selection was cancelled.', 'info');
      } else {
        toast(
          error instanceof Error ? error.message : 'Could not save PDFs to the folder.',
          'error',
        );
      }
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <section className="stack generation-editor">
      <div className="button-row">
        <button type="button" disabled={pdfBusy !== null} onClick={() => void saveBothToFolder()}>
          {pdfBusy === 'folder' ? 'Saving PDFs…' : 'Save both PDFs to folder'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pdfBusy !== null}
          onClick={() =>
            void download(
              `resume-v${generation.version}.pdf`,
              <ResumePdf document={resume} />,
              'resume',
            )
          }
        >
          {pdfBusy === 'resume' ? 'Preparing resume PDF…' : 'Download resume PDF'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pdfBusy !== null}
          onClick={() =>
            void download(
              `cover-letter-v${generation.version}.pdf`,
              <CoverLetterPdf document={cover} />,
              'cover',
            )
          }
        >
          {pdfBusy === 'cover' ? 'Preparing cover letter PDF…' : 'Download cover letter PDF'}
        </button>
      </div>
      {pdfBusy ? (
        <div className="loader" role="status" aria-live="polite">
          <span className="loader-spinner" aria-hidden="true" />
          <div className="loader-copy">
            <p className="loader-title">Generating PDF</p>
            <p className="loader-hint">
              {pdfBusy === 'folder'
                ? 'Building both files and writing them to your selected folder.'
                : pdfBusy === 'resume'
                  ? 'Building your resume download.'
                  : 'Building your cover letter download.'}
            </p>
          </div>
        </div>
      ) : null}
      <div className="preview-columns">
        <section className="card pdf-preview">
          <PdfPreview
            heading="Resume preview"
            title="Resume PDF preview"
            document={<ResumePdf document={resume} />}
          />
        </section>
        <section className="card pdf-preview">
          <PdfPreview
            heading="Cover letter preview"
            title="Cover letter PDF preview"
            document={<CoverLetterPdf document={cover} />}
          />
        </section>
      </div>
    </section>
  );
}
