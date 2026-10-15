const PDFDocument = require('pdfkit');
const path = require('node:path');

const C = Object.freeze({ TOYOTA_RED: '#EB0A1E', DARK_TEXT: '#17212F', MUTED_TEXT: '#536177', BORDER: '#D8E0E9',
  SOFT_BACKGROUND: '#F5F7FA', SOFT_BACKGROUND_ALT: '#E9EEF4', SUCCESS_GREEN: '#07834B',
  SUCCESS_BACKGROUND: '#EAF7F0', ERROR_RED: '#D52231', ERROR_BACKGROUND: '#FFF0F1', WHITE: '#FFFFFF',
  red: '#EB0A1E', dark: '#17212F', muted: '#536177', border: '#D8E0E9', soft: '#F5F7FA',
  green: '#07834B', greenSoft: '#EAF7F0', redSoft: '#FFF0F1', white: '#FFFFFF' });
const S = Object.freeze({ margin: 40, footerY: 806, contentBottom: 786, radius: 9, sectionGap: 17,
  iconCircle: 15, tableRow: 30, summaryRow: 24, body: 9.5, label: 9, heading: 13, divider: .7 });
const M = S.margin;
const RIGHT = 555;
const WIDTH = RIGHT - M;
const BOTTOM = S.contentBottom;
const money = cents => `₱ ${((Number(cents) || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emailMoney = cents => `PHP ${((Number(cents) || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = value => value ? new Date(value).toLocaleDateString('en-PH',
  { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const time = value => value ? new Date(value).toLocaleTimeString('en-PH',
  { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : '';
const stamp = value => `${date(value)} · ${time(value)}`;
const method = value => ({ gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank Transfer', cash: 'Cash', no_charge: 'No Charge' })[value]
  || String(value || 'Not recorded').replaceAll('_', ' ');

function text(pdf, value, x, y, width, size = 10, color = C.dark, bold = false, extra = {}) {
  pdf.font(bold ? 'Noto-Bold' : 'Noto').fontSize(size).fillColor(color)
    .text(String(value ?? ''), x, y, { width, lineBreak: false, ellipsis: true, ...extra });
}
function line(pdf, x1, y, x2, color = C.border) {
  pdf.moveTo(x1, y).lineTo(x2, y).lineWidth(.7).strokeColor(color).stroke();
}
function card(pdf, x, y, width, height, fill = C.soft, stroke = null) {
  pdf.roundedRect(x, y, width, height, S.radius).fillColor(fill).fill();
  if (stroke) pdf.roundedRect(x, y, width, height, S.radius).lineWidth(.65).strokeColor(stroke).stroke();
}
function icon(pdf, kind, x, y, color = C.muted) {
  pdf.save().lineWidth(1.6).strokeColor(color).fillColor(color);
  if (kind === 'person') {
    pdf.circle(x + 7, y + 5, 3.3).fill();
    pdf.roundedRect(x + 1, y + 11, 12, 7, 3).fill();
  } else if (kind === 'car') {
    pdf.moveTo(x + 1, y + 10).lineTo(x + 4, y + 4).lineTo(x + 16, y + 4).lineTo(x + 19, y + 10)
      .closePath().stroke();
    pdf.roundedRect(x, y + 9, 20, 8, 2).stroke();
    pdf.circle(x + 4, y + 17, 1.7).fill(); pdf.circle(x + 16, y + 17, 1.7).fill();
  } else if (kind === 'check') {
    pdf.moveTo(x + 2, y + 9).lineTo(x + 7, y + 14).lineTo(x + 18, y + 3).stroke();
  } else if (kind === 'alert') {
    pdf.font('Noto-Bold').fontSize(16).text('!', x + 7, y + 1, { lineBreak: false });
  } else if (kind === 'service') {
    pdf.moveTo(x + 2, y + 16).lineTo(x + 14, y + 4).stroke();
    pdf.circle(x + 16, y + 3, 3).stroke(); pdf.circle(x + 3, y + 16, 2).stroke();
  } else if (kind === 'summary') {
    pdf.roundedRect(x + 2, y + 1, 15, 18, 2).stroke();
    [6, 10, 14].forEach(offset => pdf.moveTo(x + 5, y + offset).lineTo(x + 14, y + offset).stroke());
  } else if (kind === 'reference') {
    pdf.rect(x + 3, y + 1, 13, 18).stroke();
    [6, 10, 14].forEach(offset => pdf.moveTo(x + 6, y + offset).lineTo(x + 13, y + offset).stroke());
  } else if (kind === 'payment') {
    pdf.roundedRect(x + 1, y + 4, 18, 12, 2).stroke();
    pdf.moveTo(x + 2, y + 8).lineTo(x + 18, y + 8).stroke();
  }
  pdf.restore();
}
function peso(pdf, cents, right, y, size = 10, color = C.dark, bold = false) {
  text(pdf, money(cents), right - 145, y, 145, size, color, bold, { align: 'right' });
}
function emblem(pdf, x, y) {
  pdf.save().strokeColor(C.red).lineWidth(2.2);
  pdf.ellipse(x + 20, y + 17, 20, 13).stroke();
  pdf.ellipse(x + 20, y + 15, 6, 12).stroke();
  pdf.ellipse(x + 20, y + 10, 15, 5).stroke();
  pdf.restore();
}
function begin(title) {
  const pdf = new PDFDocument({ size: 'A4', margin: 0, compress: true, bufferPages: true });
  pdf.registerFont('Noto', path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf'));
  pdf.registerFont('Noto-Bold', path.join(__dirname, '../assets/fonts/NotoSans-Bold.ttf'));
  pdf.info.Title = `Toyota AutoCare ${title}`;
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
  });
  const state = { pdf, y: 48, result };
  header(state, title);
  return state;
}
function ensure(state, height) {
  if (state.y + height <= BOTTOM) return;
  state.pdf.addPage(); state.y = 48;
  text(state.pdf, 'TOYOTA  AutoCare', M, 37, 220, 12, C.dark, true);
  text(state.pdf, 'CONTINUED', RIGHT - 95, 40, 95, 8, C.muted, true, { align: 'right' });
  state.y = 74;
}
function header(state, title) {
  const { pdf } = state;
  emblem(pdf, M, 48);
  text(pdf, 'TOYOTA', 89, 53, 119, 22, C.red, true);
  pdf.moveTo(211, 54).lineTo(211, 78).lineWidth(.9).strokeColor(C.border).stroke();
  text(pdf, 'AutoCare', 224, 53, 155, 22, C.dark, true);
  text(pdf, title.toUpperCase(), 375, 59, RIGHT - 375, 8.3, C.muted, true,
    { align: 'right', characterSpacing: 1 });
  state.y = 105;
}
function meta(state, entries) {
  const { pdf } = state;
  const y = state.y;
  const width = WIDTH / entries.length;
  entries.forEach(([label, value, sub], index) => {
    const x = M + width * index + (index ? 16 : 0);
    if (index) pdf.moveTo(M + width * index, y + 2).lineTo(M + width * index, y + 49)
      .lineWidth(.7).strokeColor(C.border).stroke();
    text(pdf, label, x, y + 1, width - 21, 9, C.muted);
    const maxWidth = width - (index ? 33 : 22);
    let fontSize = 14;
    while (fontSize > 9 && pdf.font('Noto-Bold').fontSize(fontSize).widthOfString(String(value ?? '')) > maxWidth) fontSize -= .5;
    text(pdf, value, x, y + 18, maxWidth, fontSize, C.dark, true);
    if (sub) text(pdf, sub, x, y + 38, width - 21, 8.5, C.muted);
  });
  state.y = y + 72;
}
function parties(state, client, vehicle) {
  ensure(state, 118);
  const { pdf, y } = state;
  card(pdf, M, y, WIDTH, 108, C.soft);
  pdf.moveTo(292, y + 17).lineTo(292, y + 91).lineWidth(.7).strokeColor(C.border).stroke();
  pdf.circle(M + 29, y + 36, 17).fillColor(C.SOFT_BACKGROUND_ALT).fill();
  icon(pdf, 'person', M + 22, y + 25);
  text(pdf, 'Customer', M + 58, y + 19, 190, 9, C.muted);
  text(pdf, client?.fullName || 'Customer', M + 58, y + 38, 190, 12, C.dark, true);
  if (client?.phone) text(pdf, client.phone, M + 58, y + 58, 190, 9.5, C.muted);
  text(pdf, client?.email || '', M + 58, y + (client?.phone ? 76 : 62), 190, 9, C.muted,
    false, { lineBreak: true, height: client?.phone ? 19 : 32 });
  pdf.circle(320, y + 36, 17).fillColor(C.SOFT_BACKGROUND_ALT).fill();
  icon(pdf, 'car', 310, y + 25);
  text(pdf, 'Vehicle', 348, y + 19, 190, 9, C.muted);
  text(pdf, [vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'Vehicle', 348, y + 38, 190, 12, C.dark, true);
  text(pdf, [vehicle?.year, vehicle?.variant].filter(Boolean).join(' · '), 348, y + 58, 190, 9.5, C.muted);
  text(pdf, vehicle?.plateNumber || '', 348, y + 76, 190, 9.5, C.dark, true);
  state.y = y + 120;
}
function section(state, title, symbol = 'summary') {
  ensure(state, 39);
  const { pdf } = state;
  pdf.circle(M + S.iconCircle, state.y + S.iconCircle, S.iconCircle)
    .fillColor(symbol === 'service' ? C.red : C.dark).fill();
  icon(pdf, symbol, M + 5, state.y + 5, C.white);
  text(pdf, title, M + 42, state.y + 5, WIDTH - 42, S.heading, C.dark, true);
  state.y += 42;
}
function list(state, items) {
  const { pdf } = state;
  for (const [index, item] of items.entries()) {
    pdf.font('Noto').fontSize(10);
    const rowHeight = Math.max(35, Math.ceil(pdf.heightOfString(String(item.name || ''), { width: WIDTH - 88 })) + 18);
    ensure(state, rowHeight);
    const y = state.y;
    card(pdf, M, y, WIDTH, rowHeight, C.white, C.border);
    pdf.circle(M + 22, y + rowHeight / 2, 12).fillColor(C.redSoft).fill();
    icon(pdf, 'service', M + 13, y + rowHeight / 2 - 9, C.red);
    text(pdf, item.name, M + 48, y + 10, WIDTH - 62, 10, C.dark,
      false, { lineBreak: true, height: rowHeight - 13 });
    state.y += rowHeight + (index === items.length - 1 ? 0 : 3);
  }
  state.y += 14;
}
function serviceTable(state, items) {
  const { pdf } = state;
  const headings = () => {
    ensure(state, 30);
    const y = state.y;
    card(pdf, M, y, WIDTH, 28, C.soft);
    text(pdf, '#', M + 16, y + 8, 23, 9, C.muted, true);
    text(pdf, 'Description', M + 51, y + 8, 282, 9, C.muted, true);
    text(pdf, 'Qty', M + 350, y + 8, 42, 9, C.muted, true, { align: 'center' });
    text(pdf, 'Amount', M + 401, y + 8, 100, 9, C.muted, true, { align: 'right' });
    state.y += 28;
  };
  headings();
  items.forEach((item, index) => {
    pdf.font('Noto').fontSize(9.5);
    const rowHeight = Math.max(30, Math.ceil(pdf.heightOfString(String(item.name), { width: 280 })) + 14);
    if (state.y + rowHeight > BOTTOM) { ensure(state, rowHeight + 30); headings(); }
    const y = state.y;
    if (index % 2) pdf.rect(M, y, WIDTH, rowHeight).fillColor('#FBFCFD').fill();
    text(pdf, index + 1, M + 16, y + 9, 23, 9.5);
    text(pdf, item.name, M + 51, y + 9, 282, 9.5, C.dark,
      false, { lineBreak: true, height: rowHeight - 12 });
    text(pdf, item.quantity || 1, M + 350, y + 9, 42, 9.5, C.dark, false, { align: 'center' });
    peso(pdf, item.priceCents, RIGHT - 15, y + 9, 9.5);
    line(pdf, M, y + rowHeight, RIGHT);
    state.y += rowHeight;
  });
  state.y += S.sectionGap;
}
function summary(state, rows) {
  const height = 14 + rows.length * S.summaryRow;
  ensure(state, height + 16);
  const { pdf, y } = state;
  card(pdf, M, y, WIDTH, height, C.soft);
  rows.forEach(([label, cents, emphasis, positive], index) => {
    const rowY = y + 9 + index * S.summaryRow;
    if (emphasis) pdf.roundedRect(M + 5, rowY - 2, WIDTH - 10, 23, 5).fillColor(C.SOFT_BACKGROUND_ALT).fill();
    text(pdf, label, M + 16, rowY + 3, 300, emphasis ? 10.5 : 9.5, C.dark, Boolean(emphasis));
    peso(pdf, cents, RIGHT - 16, rowY + 3, emphasis ? 11 : 9.5,
      positive ? C.green : C.dark, Boolean(emphasis));
    if (index < rows.length - 1 && !emphasis) line(pdf, M + 16, rowY + 23, RIGHT - 16);
  });
  state.y = y + height + 17;
}
function banner(state, kind, title, subtitle) {
  ensure(state, 60);
  const { pdf, y } = state;
  const ok = kind === 'success';
  card(pdf, M, y, WIDTH, 52, ok ? C.greenSoft : C.redSoft, ok ? '#A6DCC0' : '#F6C7CC');
  pdf.circle(M + 29, y + 26, 15).fillColor(ok ? C.green : C.red).fill();
  icon(pdf, ok ? 'check' : 'alert', M + 19, y + 16, C.white);
  text(pdf, title, M + 58, y + 10, WIDTH - 75, 12, ok ? C.green : C.red, true);
  text(pdf, subtitle, M + 58, y + 30, WIDTH - 75, 9, C.muted);
  state.y = y + 64;
}
function paymentDetails(state, payment) {
  ensure(state, 59);
  const { pdf, y } = state;
  pdf.circle(M + 16, y + 20, 16).fillColor(C.soft).fill();
  icon(pdf, 'payment', M + 6, y + 10);
  text(pdf, 'Payment Method', M + 42, y + 3, 178, 9, C.muted);
  text(pdf, method(payment?.method), M + 42, y + 21, 178, 10.5, C.dark, true);
  pdf.moveTo(302, y + 2).lineTo(302, y + 46).lineWidth(.7).strokeColor(C.border).stroke();
  pdf.circle(328, y + 20, 16).fillColor(C.soft).fill();
  icon(pdf, 'reference', 318, y + 10);
  text(pdf, 'Reference Number', 356, y + 3, 180, 9, C.muted);
  text(pdf, payment?.reference || 'Not provided', 356, y + 21, 180, 10, C.dark, true);
  state.y += 59;
}
function note(state, value) {
  state.pdf.font('Noto').fontSize(8.5);
  const height = Math.max(37, state.pdf.heightOfString(value, { width: WIDTH - 24 }) + 20);
  ensure(state, height);
  line(state.pdf, M, state.y, RIGHT);
  text(state.pdf, value, M + 19, state.y + 9, WIDTH - 20, 8.5, C.muted,
    false, { lineBreak: true, height: height - 14 });
  state.pdf.circle(M + 6, state.y + 15, 5).fillColor(C.muted).fill();
  text(state.pdf, 'i', M + 4.5, state.y + 10.5, 5, 7, C.white, true);
  state.y += height;
}
function finish(state) {
  const { pdf } = state;
  const pages = pdf.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    pdf.switchToPage(index);
    line(pdf, M, S.footerY, RIGHT);
    text(pdf, 'Toyota AutoCare', M, 813, 110, 7.5, C.muted, true);
    text(pdf, ' |  System-generated financial document', M + 92, 813, 320, 7.5, C.muted);
    text(pdf, `${index + 1} / ${pages.count}`, RIGHT - 45, 813, 45, 7.5, C.muted, false, { align: 'right' });
  }
  pdf.end();
  return state.result;
}

module.exports = { begin, ensure, meta, parties, section, list, serviceTable, summary, banner,
  paymentDetails, note, finish, money, emailMoney, date, time, stamp, method };
