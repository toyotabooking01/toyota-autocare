const layout = require('./financialPdfLayout');

function renderDownpayment(receipt) {
  const page = layout.begin('Downpayment Receipt');
  layout.meta(page, [
    ['Receipt No.', receipt.receiptNumber],
    ['Booking Reference', receipt.bookingSnapshot.bookingReference],
  ]);
  layout.parties(page, receipt.clientSnapshot, receipt.vehicleSnapshot);
  layout.section(page, 'Booked Services', 'service');
  layout.list(page, receipt.serviceItems || []);
  layout.section(page, 'Payment Summary', 'summary');
  layout.summary(page, [
    ['Service Estimate', receipt.financialSnapshot.estimatedTotalCents],
    ['Downpayment Paid', receipt.financialSnapshot.amountPaidCents, true],
    ['Remaining Estimated Balance', receipt.financialSnapshot.estimatedRemainingCents, true],
  ]);
  layout.banner(page, 'success', 'Verified', layout.stamp(receipt.paymentSnapshot.verifiedAt));
  layout.paymentDetails(page, receipt.paymentSnapshot);
  layout.note(page, 'This verified downpayment applies to the original estimate. The final bill may change only through the approved service workflow.');
  return layout.finish(page);
}

function renderSettlement(receipt) {
  const full = receipt.type === 'full_payment';
  const snapshot = receipt.settlementSnapshot;
  const page = layout.begin(full ? 'Full Payment Receipt' : 'Final Payment Receipt');
  layout.meta(page, [
    ['Receipt No.', receipt.receiptNumber],
    ['Booking Reference', receipt.bookingSnapshot.bookingReference],
    ['Payment Date', layout.date(receipt.paymentSnapshot.verifiedAt), layout.time(receipt.paymentSnapshot.verifiedAt)],
  ]);
  layout.parties(page, receipt.clientSnapshot, receipt.vehicleSnapshot);
  if (full) {
    layout.section(page, 'Final Settlement Summary', 'summary');
    layout.summary(page, [
      ['Original Services', snapshot.originalServicesTotalCents],
      ['Approved Additional Work', snapshot.additionalWorkTotalCents],
      ['Final Service Total', snapshot.finalServiceTotalCents, true],
    ]);
    layout.section(page, 'Payments', 'payment');
    layout.summary(page, [
      ['Downpayment(s)', snapshot.verifiedDownpaymentCents],
      ['Final Payment(s)', snapshot.verifiedFinalPaymentsCents],
      ['Total Paid', snapshot.totalVerifiedPaymentsCents, true],
      ['Remaining Balance', snapshot.remainingBalanceCents, true, true],
    ]);
  } else {
    layout.section(page, 'Payment Summary', 'summary');
    layout.summary(page, [
      ['Final Service Total', snapshot.finalServiceTotalCents, true],
      ['Downpayment Paid', snapshot.verifiedDownpaymentCents],
      ['This Final Payment', snapshot.thisPaymentCents],
      ['Total Paid', snapshot.totalVerifiedPaymentsCents, true],
      ['Remaining Balance', snapshot.remainingBalanceCents, true, snapshot.remainingBalanceCents === 0],
    ]);
  }
  const paid = snapshot.remainingBalanceCents === 0;
  layout.banner(page, 'success', paid ? 'Fully Paid' : 'Verified', layout.stamp(receipt.paymentSnapshot.verifiedAt));
  if (!full) layout.paymentDetails(page, receipt.paymentSnapshot);
  layout.note(page, full ? 'Payment complete. Vehicle is eligible for release. Staff or Admin must complete the release action.'
    : paid ? 'This verified payment completed the balance. Vehicle release remains a separate Staff or Admin action.'
      : 'This receipt records this verified final payment. The remaining balance must be settled before vehicle release.');
  return layout.finish(page);
}

function render(receipt) {
  return receipt.type === 'downpayment' ? renderDownpayment(receipt) : renderSettlement(receipt);
}

module.exports = { render, money: layout.emailMoney };
