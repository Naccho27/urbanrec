'use strict'

const { Parser }  = require('json2csv')
const PDFDocument = require('pdfkit')
const dayjs       = require('dayjs')

// ── CSV ───────────────────────────────────────────────────

// Convierte un array de objetos a formato CSV
// fields define qué columnas incluir y con qué etiqueta
const toCSV = (data, fields) => {
  if (!data || data.length === 0) {
    throw Object.assign(new Error('No hay datos para exportar'), { statusCode: 400 })
  }

  const parser = new Parser({
    fields,
    delimiter: ',',
    withBOM:   true   // BOM para que Excel lo abra correctamente con tildes
  })

  return parser.parse(data)
}

// ── PDF ───────────────────────────────────────────────────

// Genera un PDF con tabla de datos y lo escribe en el response
// Usa streaming para no cargar todo en memoria
const toPDF = (res, { title, headers, rows, filename }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' })

  // Headers de HTTP para descarga
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`)

  // Pipe el PDF directo al response
  doc.pipe(res)

  // ── Encabezado del documento ──────────────────────────
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('Sistema de Gestión de Residuos Urbanos', { align: 'center' })

  doc
    .fontSize(14)
    .font('Helvetica')
    .text('Municipalidad de Villa María', { align: 'center' })

  doc.moveDown(0.5)

  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(title, { align: 'center' })

  doc
    .fontSize(9)
    .font('Helvetica')
    .text(`Generado el ${dayjs().format('DD/MM/YYYY HH:mm')}`, { align: 'center' })

  doc.moveDown(1)

  // ── Tabla ─────────────────────────────────────────────
  const pageWidth   = doc.page.width - 80   // margen 40 de cada lado
  const colWidth    = pageWidth / headers.length
  const rowHeight   = 20
  let   currentY    = doc.y

  // Encabezados de la tabla
  doc.font('Helvetica-Bold').fontSize(9)

  headers.forEach((header, i) => {
    doc.text(
      header,
      40 + (i * colWidth),
      currentY,
      { width: colWidth - 4, align: 'left' }
    )
  })

  currentY += rowHeight

  // Línea separadora
  doc
    .moveTo(40, currentY)
    .lineTo(40 + pageWidth, currentY)
    .stroke()

  currentY += 4

  // Filas de datos
  doc.font('Helvetica').fontSize(8)

  rows.forEach((row, rowIndex) => {
    // Fondo alternado para legibilidad
    if (rowIndex % 2 === 0) {
      doc
        .rect(40, currentY - 2, pageWidth, rowHeight)
        .fill('#F5F5F5')
      doc.fill('#000000')
    }

    row.forEach((cell, i) => {
      doc.text(
        cell !== null && cell !== undefined ? String(cell) : '-',
        40 + (i * colWidth),
        currentY,
        { width: colWidth - 4, align: 'left' }
      )
    })

    currentY += rowHeight

    // Nueva página si se llena
    if (currentY > doc.page.height - 60) {
      doc.addPage()
      currentY = 40
    }
  })

  // ── Footer ────────────────────────────────────────────
  doc
    .fontSize(8)
    .font('Helvetica')
    .text(
      `Página 1 — Documento generado automáticamente por el sistema`,
      40,
      doc.page.height - 40,
      { align: 'center' }
    )

  doc.end()
}

module.exports = { toCSV, toPDF }