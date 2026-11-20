import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx-js-style'
import type { ReportDocument } from '@/domain/types'
import { downloadBlob } from '@/domain/format'

function filename(report: ReportDocument, extension: string) {
  const day = new Date().toISOString().slice(0, 10)
  return `SecurityBankGT_${report.id}_${day}.${extension}`
}

export function exportarPdf(report: ReportDocument) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: report.titulo, author: 'SecurityBankGT', subject: 'Documento confidencial' })
  const drawHeader = () => {
    doc.setFillColor(11, 37, 69)
    doc.roundedRect(14, 10, 10, 10, 2, 2, 'F')
    doc.setFillColor(19, 168, 158)
    doc.circle(19, 15, 2.2, 'F')
    doc.setTextColor(11, 37, 69)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('SecurityBankGT', 28, 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(78, 96, 116)
    doc.text(`Generado: ${report.fechaGeneracion}`, 28, 20)
    doc.text(`Usuario: ${report.generadoPor}`, 120, 15)
  }
  drawHeader()
  doc.setTextColor(11, 37, 69)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(report.titulo, 14, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(78, 96, 116)
  doc.text(report.subtitulo, 14, 38)
  let y = 46
  report.kpis.forEach((kpi, index) => {
    const x = 14 + (index % 4) * 48
    if (index > 0 && index % 4 === 0) y += 16
    doc.setFillColor(244, 247, 251)
    doc.roundedRect(x, y, 45, 14, 2, 2, 'F')
    const tone = kpi.tone === 'danger' ? [190, 18, 60] : kpi.tone === 'warn' ? [180, 83, 9] : [12, 110, 104]
    doc.setFillColor(tone[0], tone[1], tone[2])
    doc.circle(x + 4, y + 7, 1.6, 'F')
    doc.setFontSize(7)
    doc.setTextColor(78, 96, 116)
    doc.text(kpi.label, x + 8, y + 5)
    doc.setFontSize(9)
    doc.setTextColor(11, 37, 69)
    doc.text(kpi.value, x + 8, y + 11)
  })
  y += 22
  autoTable(doc, {
    startY: y,
    head: [report.columnas],
    body: report.filas,
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [11, 37, 69], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 247, 251] },
    margin: { top: 28, bottom: 16, left: 14, right: 14 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader()
    },
  })
  if (report.detalleFilas.length) {
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20
    doc.setFontSize(11)
    doc.setTextColor(11, 37, 69)
    doc.text(report.detalleTitulo, 14, finalY + 10)
    autoTable(doc, {
      startY: finalY + 14,
      head: [report.detalleColumnas],
      body: report.detalleFilas,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [19, 168, 158], textColor: 255 },
      margin: { left: 14, right: 14, bottom: 16 },
    })
  }
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(78, 96, 116)
    doc.text('Documento confidencial', 14, 290)
    doc.text(`Página ${page} de ${total}`, 170, 290)
  }
  doc.save(filename(report, 'pdf'))
}

export function exportarExcel(report: ReportDocument) {
  const book = XLSX.utils.book_new()
  const resumen = [
    ['SecurityBankGT'],
    [report.titulo],
    ['Generado', report.fechaGeneracion],
    ['Usuario', report.generadoPor],
    [],
    ['Indicador', 'Valor'],
    ...report.kpis.map((kpi) => [kpi.label, kpi.value]),
    [],
    ['Notas'],
    ...report.notas.map((nota) => [nota]),
  ]
  const resumenSheet = XLSX.utils.aoa_to_sheet(resumen)
  resumenSheet['!cols'] = [{ wch: 28 }, { wch: 48 }]
  styleHeader(resumenSheet, ['A1', 'A6', 'B6'])
  const datos = [report.columnas, ...report.filas]
  const datosSheet = XLSX.utils.aoa_to_sheet(datos)
  datosSheet['!cols'] = report.columnas.map((column) => ({ wch: Math.max(14, Math.min(40, column.length + 8)) }))
  datosSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(datos.length - 1, 0), c: Math.max(report.columnas.length - 1, 0) } }) }
  datosSheet['!views'] = [{ state: 'frozen', ySplit: 1 }]
  styleRow(datosSheet, report.columnas.length)
  const detalle = [report.detalleColumnas, ...report.detalleFilas]
  const detalleSheet = XLSX.utils.aoa_to_sheet(detalle.length > 1 ? detalle : [['Sin detalle adicional']])
  detalleSheet['!cols'] = (report.detalleColumnas.length ? report.detalleColumnas : ['Detalle']).map(() => ({ wch: 36 }))
  detalleSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(detalle.length - 1, 0), c: Math.max((report.detalleColumnas.length || 1) - 1, 0) } }) }
  detalleSheet['!views'] = [{ state: 'frozen', ySplit: 1 }]
  styleRow(detalleSheet, report.detalleColumnas.length || 1)
  XLSX.utils.book_append_sheet(book, resumenSheet, 'Resumen')
  XLSX.utils.book_append_sheet(book, datosSheet, 'Datos')
  XLSX.utils.book_append_sheet(book, detalleSheet, 'Detalle')
  XLSX.writeFile(book, filename(report, 'xlsx'))
}

export function exportarCsv(report: ReportDocument) {
  const rows = [report.columnas, ...report.filas]
  const body = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  downloadBlob(new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' }), filename(report, 'csv'))
}

function styleHeader(sheet: XLSX.WorkSheet, addresses: string[]) {
  addresses.forEach((address) => {
    const cell = sheet[address] as XLSX.CellObject | undefined
    if (!cell) return
    cell.s = headerStyle()
  })
}

function styleRow(sheet: XLSX.WorkSheet, columns: number) {
  for (let column = 0; column < columns; column += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: column })
    const cell = sheet[address] as XLSX.CellObject | undefined
    if (cell) cell.s = headerStyle()
  }
}

function headerStyle() {
  return {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0B2545' } },
    alignment: { vertical: 'center' },
  }
}
