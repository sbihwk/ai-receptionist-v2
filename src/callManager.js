const activeCalls = new Map();

function initCall(callSid, data = {}) {
  const callState = {
    callSid,
    from: data.from || '',
    to: data.to || '',
    startTime: new Date().toISOString(),
    endTime: null,
    streamSid: null,
    returningCustomer: data.returningCustomer || false,
    customerName: data.customerName || '',
    jobCount: data.jobCount || 0,
    transcript: [],
    bookingMade: false,
    bookingId: null,
    emergencyDetected: false,
    transferRequested: false,
    upsellMentioned: false,
    upsellInterested: false,
    callClassification: null,
    customerMood: 'neutral',
    serviceType: null,
    calendarEventId: null,
    appointmentDatetime: null
  };
  activeCalls.set(callSid, callState);
  return callState;
}

function getCall(callSid) {
  return activeCalls.get(callSid) || null;
}

function updateCall(callSid, updates) {
  const call = activeCalls.get(callSid);
  if (!call) return null;
  Object.assign(call, updates);
  return call;
}

function addTranscriptEntry(callSid, role, text) {
  const call = activeCalls.get(callSid);
  if (!call) return;
  call.transcript.push({
    role,
    text,
    timestamp: new Date().toISOString()
  });
}

function endCall(callSid) {
  const call = activeCalls.get(callSid);
  if (!call) return null;
  call.endTime = new Date().toISOString();
  return call;
}

function removeCall(callSid) {
  const call = activeCalls.get(callSid);
  activeCalls.delete(callSid);
  return call;
}

function getActiveCalls() {
  return activeCalls;
}

function getActiveCallCount() {
  return activeCalls.size;
}

function getTranscriptText(callSid) {
  const call = activeCalls.get(callSid);
  if (!call) return '';
  return call.transcript
    .map(t => `${t.role === 'user' ? 'Caller' : 'Alex'}: ${t.text}`)
    .join('\n');
}

module.exports = {
  initCall,
  getCall,
  updateCall,
  addTranscriptEntry,
  endCall,
  removeCall,
  getActiveCalls,
  getActiveCallCount,
  getTranscriptText
};
