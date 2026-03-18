import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  BorderStyle,
  AlignmentType,
} from 'docx'

// ── Block node types ──────────────────────────────────────────────────────────

type BlockNode =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'rule' }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'blank' }

// ── Inline formatting ─────────────────────────────────────────────────────────

function parseInline(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return new TextRun({ text: part.slice(2, -2), bold: true })
    }
    return new TextRun({ text: part })
  })
}

// ── Table cell splitting ──────────────────────────────────────────────────────

function splitCells(line: string): string[] {
  // Strip leading/trailing pipes, then split on |
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every(c => /^:?-+:?$/.test(c))
}

// ── Markdown parser ───────────────────────────────────────────────────────────

function parseMarkdown(markdown: string): BlockNode[] {
  const lines = markdown.split('\n')
  const nodes: BlockNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Headings
    const headingMatch = line.match(/^(#{1,3}) (.+)/)
    if (headingMatch) {
      nodes.push({ kind: 'heading', level: headingMatch[1].length as 1 | 2 | 3, text: headingMatch[2].trim() })
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push({ kind: 'rule' })
      i++
      continue
    }

    // Bullet
    if (line.startsWith('- ')) {
      nodes.push({ kind: 'bullet', text: line.slice(2) })
      i++
      continue
    }

    // Table — consume all consecutive pipe-starting lines
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) {
        const headers = splitCells(tableLines[0])
        // tableLines[1] is the separator row — skip it
        const rows = tableLines.slice(2).map(splitCells).filter(r => !isSeparatorRow(r))
        nodes.push({ kind: 'table', headers, rows })
      }
      continue
    }

    // Blank / whitespace
    if (line.trim() === '') {
      nodes.push({ kind: 'blank' })
      i++
      continue
    }

    // Paragraph — join consecutive non-structure lines
    let text = line
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,3} /) &&
      !lines[i].startsWith('- ') &&
      !lines[i].startsWith('|') &&
      !/^---+$/.test(lines[i].trim())
    ) {
      text += ' ' + lines[i]
      i++
    }
    nodes.push({ kind: 'paragraph', text })
  }

  return nodes
}

// ── DOCX element builders ─────────────────────────────────────────────────────

const HEADING_LEVEL_MAP: Record<1 | 2 | 3, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
}

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } as const

function buildTable(headers: string[], rows: string[][]): Table {
  const headerCells = headers.map(h =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
      borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
    }),
  )

  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          children: [new Paragraph({ children: parseInline(cell) })],
          borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
          // For two-column info tables, give the Value column more width
          width: headers.length === 2
            ? { size: ci === 0 ? 20 : 80, type: WidthType.PERCENTAGE }
            : undefined,
        }),
      ),
    }),
  )

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headerCells, tableHeader: true }),
      ...dataRows,
    ],
  })
}

function buildDocxChildren(blocks: BlockNode[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = []

  for (const node of blocks) {
    switch (node.kind) {
      case 'heading':
        children.push(new Paragraph({
          heading: HEADING_LEVEL_MAP[node.level],
          children: parseInline(node.text),
        }))
        break

      case 'paragraph':
        children.push(new Paragraph({ children: parseInline(node.text) }))
        break

      case 'bullet':
        children.push(new Paragraph({
          bullet: { level: 0 },
          children: parseInline(node.text),
        }))
        break

      case 'rule':
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
          children: [new TextRun('')],
        }))
        break

      case 'table':
        if (node.headers.length > 0) {
          children.push(buildTable(node.headers, node.rows))
          // Add spacing paragraph after table
          children.push(new Paragraph({ children: [new TextRun('')] }))
        }
        break

      case 'blank':
        // Skip blank nodes — docx spacing is handled by paragraph spacing
        break
    }
  }

  return children
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function mdToDocx(markdown: string): Promise<Blob> {
  const blocks = parseMarkdown(markdown)
  const docChildren = buildDocxChildren(blocks)
  const doc = new Document({
    sections: [{
      properties: {},
      children: docChildren,
    }],
  })
  return Packer.toBlob(doc)
}
