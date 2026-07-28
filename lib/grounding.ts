import type { CoverLetterDocument, GroundedText, Profile, ResumeDocument } from './types';
import { GenerationOrigin } from './types';

export function collectProfileSourceIds(profile: Profile): Set<string> {
  const ids = new Set<string>();
  for (const link of profile.basics.links) ids.add(link.id);
  if (profile.headline) ids.add(profile.headline.id);
  if (profile.summary) ids.add(profile.summary.id);
  for (const role of profile.roles) {
    ids.add(role.id);
    for (const bullet of role.bullets) ids.add(bullet.id);
  }
  for (const education of profile.education) {
    ids.add(education.id);
    for (const detail of education.details) ids.add(detail.id);
  }
  for (const project of profile.projects) {
    ids.add(project.id);
    ids.add(project.description.id);
    for (const bullet of project.bullets) ids.add(bullet.id);
  }
  for (const skill of profile.skills) ids.add(skill.id);
  for (const certification of profile.certifications) ids.add(certification.id);
  for (const language of profile.languages) ids.add(language.id);
  return ids;
}

export type GroundingError = {
  path: string;
  reason: string;
};

export function validateGenerationGrounding(
  profile: Profile,
  resume: ResumeDocument,
  coverLetter: CoverLetterDocument,
): GroundingError[] {
  const sourceIds = collectProfileSourceIds(profile);
  const errors: GroundingError[] = [];
  const rolesById = new Map(profile.roles.map((role) => [role.id, role]));
  const educationById = new Map(profile.education.map((item) => [item.id, item]));
  const projectsById = new Map(profile.projects.map((item) => [item.id, item]));

  if (resume.basics.fullName !== profile.basics.fullName) {
    errors.push({ path: 'resume.basics.fullName', reason: 'must match profile' });
  }
  if (resume.basics.email !== profile.basics.email) {
    errors.push({ path: 'resume.basics.email', reason: 'must match profile' });
  }
  if ((resume.basics.phone ?? '') !== (profile.basics.phone ?? '')) {
    errors.push({ path: 'resume.basics.phone', reason: 'must match profile' });
  }
  if ((resume.basics.location ?? '') !== (profile.basics.location ?? '')) {
    errors.push({ path: 'resume.basics.location', reason: 'must match profile' });
  }

  checkOptionalGrounded(resume.headline, 'resume.headline', sourceIds, errors);
  checkOptionalGrounded(resume.summary, 'resume.summary', sourceIds, errors);

  resume.roles.forEach((role, index) => {
    const path = `resume.roles[${index}]`;
    const source = rolesById.get(role.sourceRoleId);
    if (!source) {
      errors.push({ path: `${path}.sourceRoleId`, reason: 'unknown role' });
      return;
    }
    if (role.company !== source.company) {
      errors.push({ path: `${path}.company`, reason: 'must match profile role' });
    }
    if (role.title !== source.title) {
      errors.push({ path: `${path}.title`, reason: 'must match profile role' });
    }
    if ((role.location ?? '') !== (source.location ?? '')) {
      errors.push({ path: `${path}.location`, reason: 'must match profile role' });
    }
    role.bullets.forEach((bullet, bulletIndex) => {
      checkGrounded(bullet, `${path}.bullets[${bulletIndex}]`, sourceIds, errors);
    });
  });

  resume.education.forEach((education, index) => {
    const path = `resume.education[${index}]`;
    const source = educationById.get(education.sourceEducationId);
    if (!source) {
      errors.push({ path: `${path}.sourceEducationId`, reason: 'unknown education' });
      return;
    }
    if (education.institution !== source.institution) {
      errors.push({ path: `${path}.institution`, reason: 'must match profile' });
    }
    if (education.qualification !== source.qualification) {
      errors.push({ path: `${path}.qualification`, reason: 'must match profile' });
    }
    if ((education.field ?? '') !== (source.field ?? '')) {
      errors.push({ path: `${path}.field`, reason: 'must match profile' });
    }
    education.details.forEach((detail, detailIndex) => {
      checkGrounded(detail, `${path}.details[${detailIndex}]`, sourceIds, errors);
    });
  });

  resume.projects.forEach((project, index) => {
    const path = `resume.projects[${index}]`;
    const source = projectsById.get(project.sourceProjectId);
    if (!source) {
      errors.push({ path: `${path}.sourceProjectId`, reason: 'unknown project' });
      return;
    }
    if (project.name !== source.name) {
      errors.push({ path: `${path}.name`, reason: 'must match profile' });
    }
    if ((project.url ?? '') !== (source.url ?? '')) {
      errors.push({ path: `${path}.url`, reason: 'must match profile' });
    }
    checkGrounded(project.description, `${path}.description`, sourceIds, errors);
    project.bullets.forEach((bullet, bulletIndex) => {
      checkGrounded(bullet, `${path}.bullets[${bulletIndex}]`, sourceIds, errors);
    });
  });

  resume.skills.forEach((item, index) => {
    checkGrounded(item, `resume.skills[${index}]`, sourceIds, errors);
  });
  resume.certifications.forEach((item, index) => {
    checkGrounded(item, `resume.certifications[${index}]`, sourceIds, errors);
  });
  resume.languages.forEach((item, index) => {
    checkGrounded(item, `resume.languages[${index}]`, sourceIds, errors);
  });

  coverLetter.paragraphs.forEach((paragraph, index) => {
    checkGrounded(paragraph, `coverLetter.paragraphs[${index}]`, sourceIds, errors);
  });

  return errors;
}

/** AI-originated output must pass grounding; user-edited blocks may keep empty sourceIds. */
export function assertAiGrounding(
  profile: Profile,
  resume: ResumeDocument,
  coverLetter: CoverLetterDocument,
  origin: typeof GenerationOrigin.Ai | typeof GenerationOrigin.Manual = GenerationOrigin.Ai,
): void {
  if (origin !== GenerationOrigin.Ai) return;
  const errors = validateGenerationGrounding(profile, resume, coverLetter);
  if (errors.length > 0) {
    throw new Error(`Invalid provenance: ${errors[0]!.path} (${errors[0]!.reason})`);
  }
}

function checkOptionalGrounded(
  value: GroundedText | undefined,
  path: string,
  sourceIds: Set<string>,
  errors: GroundingError[],
): void {
  if (!value) return;
  checkGrounded(value, path, sourceIds, errors);
}

function checkGrounded(
  value: GroundedText,
  path: string,
  sourceIds: Set<string>,
  errors: GroundingError[],
): void {
  if (value.userEdited === true) return;
  if (!value.sourceIds.length) {
    errors.push({ path, reason: 'empty sourceIds' });
    return;
  }
  for (const sourceId of value.sourceIds) {
    if (!sourceIds.has(sourceId)) {
      errors.push({ path, reason: `foreign sourceId ${sourceId}` });
    }
  }
}
