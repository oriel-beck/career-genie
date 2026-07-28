import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import type { ResumeDocument } from '@/lib/types';

const styles = StyleSheet.create({
  page: {
    color: '#111111',
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    lineHeight: 1.35,
    padding: 42,
  },
  name: { fontFamily: 'Helvetica-Bold', fontSize: 20, lineHeight: 1.1 },
  contact: { color: '#333333', fontSize: 9, marginTop: 5 },
  headline: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, marginTop: 8 },
  section: { marginTop: 13 },
  heading: {
    borderBottomColor: '#111111',
    borderBottomWidth: 0.75,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 5,
    paddingBottom: 2,
    textTransform: 'uppercase',
  },
  role: { marginTop: 7 },
  roleHeader: { fontFamily: 'Helvetica-Bold' },
  details: { color: '#333333' },
  bullet: { marginLeft: 10, marginTop: 2 },
  item: { marginTop: 3 },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading} minPresenceAhead={24}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function ResumePdf({ document }: { document: ResumeDocument }) {
  const { basics } = document;
  const contact = [
    basics.email,
    basics.phone,
    basics.location,
    ...basics.links.map(({ label, url }) => label || url),
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <Document title={`${basics.fullName} Resume`} author={basics.fullName}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{basics.fullName}</Text>
        {contact ? <Text style={styles.contact}>{contact}</Text> : null}
        {document.headline?.text ? (
          <Text style={styles.headline}>{document.headline.text}</Text>
        ) : null}

        {document.summary?.text ? (
          <Section title="Summary">
            <Text>{document.summary.text}</Text>
          </Section>
        ) : null}

        {document.roles.length ? (
          <Section title="Experience">
            {document.roles.map((role) => (
              <View key={role.sourceRoleId} style={styles.role}>
                <Text style={styles.roleHeader} minPresenceAhead={30}>
                  {role.title} — {role.company}
                </Text>
                <Text style={styles.details}>
                  {[role.location, role.dateRange].filter(Boolean).join(' | ')}
                </Text>
                {role.bullets.map((bullet, index) => (
                  <Text key={`${role.sourceRoleId}-${index}`} style={styles.bullet}>
                    • {bullet.text}
                  </Text>
                ))}
              </View>
            ))}
          </Section>
        ) : null}

        {document.education.length ? (
          <Section title="Education">
            {document.education.map((education) => (
              <View key={education.sourceEducationId} style={styles.item}>
                <Text style={styles.roleHeader} minPresenceAhead={24}>
                  {education.qualification}
                  {education.field ? `, ${education.field}` : ''}
                </Text>
                <Text>
                  {[education.institution, education.dateRange].filter(Boolean).join(' | ')}
                </Text>
                {education.details.map((detail, index) => (
                  <Text key={`${education.sourceEducationId}-${index}`} style={styles.bullet}>
                    • {detail.text}
                  </Text>
                ))}
              </View>
            ))}
          </Section>
        ) : null}

        {document.projects.length ? (
          <Section title="Projects">
            {document.projects.map((project) => (
              <View key={project.sourceProjectId} style={styles.item}>
                <Text style={styles.roleHeader} minPresenceAhead={24}>
                  {project.name}
                </Text>
                <Text>{project.description.text}</Text>
                {project.bullets.map((bullet, index) => (
                  <Text key={`${project.sourceProjectId}-${index}`} style={styles.bullet}>
                    • {bullet.text}
                  </Text>
                ))}
              </View>
            ))}
          </Section>
        ) : null}

        {document.skills.length ? (
          <Section title="Skills">
            <Text>{document.skills.map(({ text }) => text).join(', ')}</Text>
          </Section>
        ) : null}
        {document.certifications.length ? (
          <Section title="Certifications">
            <Text>{document.certifications.map(({ text }) => text).join(', ')}</Text>
          </Section>
        ) : null}
        {document.languages.length ? (
          <Section title="Languages">
            <Text>{document.languages.map(({ text }) => text).join(', ')}</Text>
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}
