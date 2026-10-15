const layout = require('./financialPdfLayout');

function render(invoice) {
  const page = layout.begin('Final Service Invoice');
  layout.meta(page, [
    ['Invoice No.', invoice.invoiceNumber],
    ['Booking Reference', invoice.bookingSnapshot.bookingReference],
    ['Invoice Date', layout.date(invoice.issuedAt)],
  ]);
  layout.parties(page, invoice.clientSnapshot, invoice.vehicleSnapshot);
  layout.section(page, 'Service Details', 'service');
  layout.serviceTable(page, [
    ...invoice.originalServiceItems.map(item => ({ name: item.name, quantity: 1, priceCents: item.priceCents })),
    ...invoice.additionalWorkItems.map(item => ({ name: `Additional work: ${item.name}`, quantity: item.quantity,
      priceCents: item.lineTotalCents })),
  ]);
  const financial = invoice.financialSnapshot;
  layout.section(page, 'Invoice Summary', 'summary');
  layout.summary(page, [
    ['Original Service Total', financial.originalServicesTotalCents],
    ['Approved Additional Work', financial.additionalWorkTotalCents],
    ['Final Service Total', financial.finalServiceTotalCents, true],
    ['Verified Payments at Issuance', financial.verifiedDownpaymentCents + financial.otherVerifiedPaymentsCents],
    ['Remaining Balance at Issuance', financial.amountDueCents, true, financial.amountDueCents === 0],
  ]);
  layout.banner(page, financial.amountDueCents === 0 ? 'success' : 'error',
    financial.amountDueCents === 0 ? 'Fully Paid' : 'Payment Due',
    financial.amountDueCents === 0 ? 'Vehicle is eligible for release after an explicit Staff or Admin action.'
      : 'Please settle the remaining balance before vehicle release.');
  return layout.finish(page);
}

module.exports = { render };
