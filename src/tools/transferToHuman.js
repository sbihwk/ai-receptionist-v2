const smsService = require('../smsService');
const businessConfig = require('../businessConfig');
const callManager = require('../callManager');

async function handleTransferToHuman(args, callSid) {
  try {
    const { reason, urgency, notes } = args;

    // 1. SMS owner with transfer request
    try {
      await smsService.sendTransferAlert(businessConfig.ownerPhone, {
        from: callSid ? (callManager.getCall(callSid)?.from || 'Unknown') : 'Unknown',
        reason: reason || 'Caller requested transfer',
        notes: notes || ''
      });
    } catch (smsErr) {
      console.error('[transferToHuman] SMS alert failed:', smsErr.message);
    }

    // 2. Update call state
    if (callSid) {
      callManager.updateCall(callSid, { transferRequested: true });
    }

    console.log(`[transferToHuman] Transfer requested — Reason: ${reason}`);

    return JSON.stringify({
      success: true,
      message: 'Transfer request sent. The owner has been notified and will call the customer back shortly.',
      urgency: urgency || 'when_available'
    });
  } catch (err) {
    console.error('[transferToHuman:handleTransferToHuman]', err.message, err);
    return JSON.stringify({
      success: false,
      message: 'Transfer request noted. Someone from the team will call back shortly.'
    });
  }
}

module.exports = { handleTransferToHuman };
