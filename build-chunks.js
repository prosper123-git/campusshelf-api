const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const [code, pdfPath] = process.argv.slice(2);
if (!code || !pdfPath) {
  console.log('Usage: node build-chunks.js "CSC 201" ../pdfs/CSC201.pdf');
  process.exit(1);
}

async function extractPages(file) {
  const pages = [];
  await pdf(fs.readFileSync(file), {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent();
      const text = content.items.map((i) => i.str).join(' ');
      pages.push(text);
      return text;
    },
  });
  return pages;
}

function chunkPage(text, page) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const out = [];
  for (let i = 0; i < clean.length; i += 700) {
    const piece = clean.slice(i, i + 900);
    if (piece.length > 80) out.push({ page, text: piece });
  }
  return out;
}

(async () => {
  const pages = await extractPages(pdfPath);
  const chunks = pages.flatMap((t, i) => chunkPage(t, i + 1));

  if (chunks.length < 5) {
    console.log('Very little text found. This PDF may be scanned images and would need OCR first.');
    process.exit(1);
  }

  fs.mkdirSync('data', { recursive: true });
  const file = path.join('data', code.replace(/\s+/g, '') + '.json');
  fs.writeFileSync(file, JSON.stringify(chunks));
  console.log(`Wrote ${chunks.length} chunks from ${pages.length} pages to ${file}`);
})();