import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import fs from 'fs';
import path from 'path';

async function generatePDF() {
  const mdPath = path.join(process.cwd(), 'docs/AUDITORIA_NEXUS_10-10.md');
  const pdfPath = path.join(process.cwd(), 'docs/AUDITORIA_NEXUS_10-10.pdf');

  if (!fs.existsSync(mdPath)) {
    console.error('Markdown file not found:', mdPath);
    process.exit(1);
  }

  const content = fs.readFileSync(mdPath, 'utf-8');
  
  // Basic PDF generation logic using jsPDF
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.text('AUDITORIA TÉCNICA NEXUS - RUMO AO 10/10', 10, 20);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  
  // Split content into lines that fit the page
  const lines = doc.splitTextToSize(content, 180);
  let y = 30;
  
  lines.forEach((line) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, 10, y);
    y += 7;
  });

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log('PDF generated successfully at:', pdfPath);
}

generatePDF().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
