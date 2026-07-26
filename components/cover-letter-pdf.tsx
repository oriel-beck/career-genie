import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import type { CoverLetterDocument } from '@/lib/types';

const styles = StyleSheet.create({
  page: {
    color: '#111111',
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.5,
    padding: 54,
  },
  greeting: { marginBottom: 16 },
  paragraph: { marginBottom: 12 },
  signoff: { marginTop: 8 },
});

export function CoverLetterPdf({ document }: { document: CoverLetterDocument }) {
  return (
    <Document title="Cover Letter">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.greeting}>{document.greeting}</Text>
        {document.paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph.text}
          </Text>
        ))}
        <View wrap={false}>
          <Text style={styles.signoff}>{document.signoff}</Text>
        </View>
      </Page>
    </Document>
  );
}
