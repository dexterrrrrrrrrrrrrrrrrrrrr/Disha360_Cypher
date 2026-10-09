import PDFDocument from 'pdfkit';
import type { ResumeContent } from '../validators/resume.js';

export function resumePdf(content: ResumeContent, template: string): PDFKit.PDFDocument {
  const compact = template === 'compact';
  const document = new PDFDocument({ size: 'A4', margin: compact ? 38 : 48, bufferPages: true, info: { Title: `${content.personal.fullName || 'Student'} Resume`, Author: content.personal.fullName } });
  const font = template === 'classic' ? 'Times-Roman' : 'Helvetica';
  const bold = template === 'classic' ? 'Times-Bold' : 'Helvetica-Bold';
  const accent = template === 'modern' ? '#4338ca' : '#17233b';
  const bodySize = compact ? 9 : 10;
  const text = (value: string) => { if (value.trim()) document.font(font).fontSize(bodySize).fillColor('#222222').text(value, { lineGap: compact ? 1 : 3 }); };
  const heading = (value: string) => { if (document.y > document.page.height - 110) document.addPage(); document.moveDown(.7).font(bold).fontSize(11).fillColor(accent).text(value.toUpperCase()); document.moveDown(.3); };
  document.font(bold).fontSize(compact ? 22 : 26).fillColor(accent).text(content.personal.fullName || 'Your name');
  text(content.personal.headline);
  text([content.personal.email, content.personal.phone, content.personal.location].filter(Boolean).join('  |  '));
  for (const link of [content.personal.website, content.personal.linkedin, content.personal.github].filter(Boolean)) document.font(font).fontSize(bodySize).fillColor(accent).text(link, { link });
  if (content.personal.summary) { heading('Profile'); text(content.personal.summary); }
  if (content.education.length) { heading('Education'); for (const item of content.education) { text([item.institution, item.degree, item.field].filter(Boolean).join(' — ')); text([item.startDate, item.endDate].filter(Boolean).join(' – ')); text(item.grade ? `Grade: ${item.grade}` : ''); document.moveDown(.3); } }
  if (content.skills.length) { heading('Skills'); text(content.skills.join(' · ')); }
  if (content.projects.length) { heading('Projects'); for (const item of content.projects) { text(item.name); text(item.description); text(item.technologies); text(item.link); document.moveDown(.4); } }
  if (content.experience.length) { heading('Experience'); for (const item of content.experience) { text([item.role, item.company].filter(Boolean).join(' — ')); text([item.startDate, item.endDate].filter(Boolean).join(' – ')); text(item.description); document.moveDown(.4); } }
  if (content.certifications.length) { heading('Certifications'); for (const item of content.certifications) text([item.name, item.issuer, item.year, item.link].filter(Boolean).join(' · ')); }
  return document;
}
