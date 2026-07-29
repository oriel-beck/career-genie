'use client';

import { pdf } from '@react-pdf/renderer';
import { useState } from 'react';
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
  const [pdfBusy, setPdfBusy] = useState(false);
  const resume = generation.resume;
  const cover = generation.coverLetter;

  async function saveBothToFolder() {
    setPdfBusy(true);
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
      setPdfBusy(false);
    }
  }

  return (
    <section className="stack generation-editor">
      <div className="button-row">
        <button type="button" disabled={pdfBusy} onClick={() => void saveBothToFolder()}>
          {pdfBusy ? 'Saving PDFs…' : 'Save both PDFs to folder'}
        </button>
      </div>
      {pdfBusy ? (
        <div className="loader" role="status" aria-live="polite">
          <span className="loader-spinner" aria-hidden="true" />
          <div className="loader-copy">
            <p className="loader-title">Generating PDF</p>
            <p className="loader-hint">Building both files and writing them to your selected folder.</p>
          </div>
        </div>
      ) : null}
      <div className="preview-columns">
        <section className="card pdf-preview">
          <PdfPreview
            heading="Resume preview"
            title="Resume PDF preview"
            downloadFilename={`resume-v${generation.version}.pdf`}
            document={<ResumePdf document={resume} />}
          />
        </section>
        <section className="card pdf-preview">
          <PdfPreview
            heading="Cover letter preview"
            title="Cover letter PDF preview"
            downloadFilename={`cover-letter-v${generation.version}.pdf`}
            document={<CoverLetterPdf document={cover} />}
          />
        </section>
      </div>
    </section>
  );
}
