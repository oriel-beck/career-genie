'use client';

import { pdf } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { useState, type ReactElement } from 'react';
import { CoverLetterPdf } from '@/components/cover-letter-pdf';
import { useFeedback } from '@/components/feedback';
import { PdfPreview } from '@/components/pdf-preview';
import { ResumePdf } from '@/components/resume-pdf';
import type { Generation, GroundedText } from '@/lib/types';

function TextEditor({ value, onChange, label }: { value: GroundedText; onChange: (next: GroundedText) => void; label: string }) {
  return <label>{label}
    <textarea value={value.text} rows={3} onChange={(event) => onChange({ ...value, text: event.target.value, userEdited: true })} />
    <span className="hint">Sources: {value.sourceIds.join(', ') || 'user edited'}</span>
  </label>;
}

export function GenerationEditor({
  generation,
  onChange,
  onSave,
}: {
  generation: Generation;
  onChange: (generation: Generation) => void;
  onSave: () => void;
}) {
  const { toast } = useFeedback();
  const [pdfBusy, setPdfBusy] = useState<'resume' | 'cover' | null>(null);
  const resume = generation.resume;
  const cover = generation.coverLetter;
  const updateResume = (next: Generation['resume']) => onChange({ ...generation, resume: next });
  const updateCover = (next: Generation['coverLetter']) => onChange({ ...generation, coverLetter: next });

  async function download(name: string, content: ReactElement<DocumentProps>, kind: 'resume' | 'cover') {
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

  return <section className="stack generation-editor">
    <div className="button-row"><button type="button" onClick={onSave} disabled={pdfBusy !== null}>Save edits as new version</button>
      <button type="button" className="secondary" disabled={pdfBusy !== null} onClick={() => void download(`resume-v${generation.version}.pdf`, <ResumePdf document={resume} />, 'resume')}>
        {pdfBusy === 'resume' ? 'Preparing resume PDF…' : 'Download resume PDF'}
      </button>
      <button type="button" className="secondary" disabled={pdfBusy !== null} onClick={() => void download(`cover-letter-v${generation.version}.pdf`, <CoverLetterPdf document={cover} />, 'cover')}>
        {pdfBusy === 'cover' ? 'Preparing cover letter PDF…' : 'Download cover letter PDF'}
      </button>
    </div>
    {pdfBusy ? (
      <div className="loader" role="status" aria-live="polite">
        <span className="loader-spinner" aria-hidden="true" />
        <div className="loader-copy">
          <p className="loader-title">Generating PDF</p>
          <p className="loader-hint">
            {pdfBusy === 'resume' ? 'Building your resume download.' : 'Building your cover letter download.'}
          </p>
        </div>
      </div>
    ) : null}
    <div className="editor-columns">
      <section className="card stack"><h2>Resume</h2>
        <p className="readonly">Name and contact are copied from your profile and cannot be edited here.</p>
        <p className="prewrap">{resume.basics.fullName}{'\n'}{[resume.basics.email, resume.basics.phone, resume.basics.location].filter(Boolean).join(' · ')}</p>
        {resume.headline && <TextEditor label="Headline" value={resume.headline} onChange={(value) => updateResume({ ...resume, headline: value })} />}
        {resume.summary && <TextEditor label="Summary" value={resume.summary} onChange={(value) => updateResume({ ...resume, summary: value })} />}
        {resume.roles.map((role, index) => <fieldset key={role.sourceRoleId}><legend>{role.title} — {role.company} <span className="readonly">(profile details)</span></legend>
          <p className="readonly">{[role.location, role.dateRange].filter(Boolean).join(' · ')}</p>
          {role.bullets.map((bullet, bulletIndex) => <TextEditor key={bulletIndex} label="Experience bullet" value={bullet} onChange={(value) => {
            const roles = [...resume.roles]; const bullets = [...role.bullets]; bullets[bulletIndex] = value; roles[index] = { ...role, bullets }; updateResume({ ...resume, roles });
          }} />)}
        </fieldset>)}
        {resume.education.map((item, index) => <fieldset key={item.sourceEducationId}><legend>{item.qualification} — {item.institution} <span className="readonly">(profile details)</span></legend>
          <p className="readonly">{item.dateRange}</p>{item.details.map((detail, detailIndex) => <TextEditor key={detailIndex} label="Education detail" value={detail} onChange={(value) => {
            const education = [...resume.education]; const details = [...item.details]; details[detailIndex] = value; education[index] = { ...item, details }; updateResume({ ...resume, education });
          }} />)}
        </fieldset>)}
        {resume.projects.map((project, index) => <fieldset key={project.sourceProjectId}><legend>{project.name} <span className="readonly">(profile details)</span></legend>
          <TextEditor label="Project description" value={project.description} onChange={(value) => { const projects = [...resume.projects]; projects[index] = { ...project, description: value }; updateResume({ ...resume, projects }); }} />
          {project.bullets.map((bullet, bulletIndex) => <TextEditor key={bulletIndex} label="Project bullet" value={bullet} onChange={(value) => {
            const projects = [...resume.projects]; const bullets = [...project.bullets]; bullets[bulletIndex] = value; projects[index] = { ...project, bullets }; updateResume({ ...resume, projects });
          }} />)}
        </fieldset>)}
        {(['skills', 'certifications', 'languages'] as const).map((section) => resume[section].map((item, index) => <TextEditor key={`${section}-${index}`} label={section} value={item} onChange={(value) => {
          const values = [...resume[section]]; values[index] = value; updateResume({ ...resume, [section]: values });
        }} />))}
      </section>
      <section className="card stack"><h2>Cover letter</h2>
        <label>Greeting<textarea value={cover.greeting} rows={2} onChange={(event) => updateCover({ ...cover, greeting: event.target.value })} /></label>
        {cover.paragraphs.map((paragraph, index) => <TextEditor key={index} label="Paragraph" value={paragraph} onChange={(value) => {
          const paragraphs = [...cover.paragraphs]; paragraphs[index] = value; updateCover({ ...cover, paragraphs });
        }} />)}
        <label>Signoff<textarea value={cover.signoff} rows={2} onChange={(event) => updateCover({ ...cover, signoff: event.target.value })} /></label>
      </section>
    </div>
    <div className="preview-columns">
      <section className="card pdf-preview"><h2>Resume preview</h2><PdfPreview title="Resume PDF preview" document={<ResumePdf document={resume} />} /></section>
      <section className="card pdf-preview"><h2>Cover letter preview</h2><PdfPreview title="Cover letter PDF preview" document={<CoverLetterPdf document={cover} />} /></section>
    </div>
  </section>;
}
