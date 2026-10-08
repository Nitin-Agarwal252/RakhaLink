const crypto = require('node:crypto');
const config = require('./config');

const tokenRecords = new Map();
const dispatchLog = [];
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

async function sendTwilio(to, body) {
  if (!config.whitelist.includes(to)) throw new Error('destination_not_whitelisted');
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !auth || !from) throw new Error('twilio_not_configured');
  const credentials = Buffer.from(`${sid}:${auth}`).toString('base64');
  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form
  });
  if (!response.ok) throw new Error(`twilio_http_${response.status}`);
  return response.json();
}

async function dispatchEvent(event, responders) {
  const result = [];
  for (const responder of responders) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    tokenRecords.set(tokenHash, { eventId: event.id, responderId: responder.id, expiresAt: Date.now() + 86400000 });
    const url = `${config.baseUrl}/r/${token}`;
    const content = `RakshaLink ${event.category} alert. ${url}`;
    const entry = {
      id: crypto.randomUUID(), sos_id: event.id, responder_id: responder.id, method: 'sms',
      simulated: config.provider !== 'twilio', label: config.provider === 'twilio' ? 'TWILIO DISPATCH' : 'SIMULATED DISPATCH',
      message: content, token_hash: tokenHash, at: new Date().toISOString(), ok: false
    };
    if (config.provider === 'twilio') {
      if (!responder.phone || !config.whitelist.includes(responder.phone)) {
        entry.error = 'destination_not_whitelisted';
      } else {
        try { await sendTwilio(responder.phone, content); entry.ok = true; }
        catch (error) { entry.error = error.message; }
      }
    } else {
      entry.ok = true;
    }
    dispatchLog.push(entry);
    result.push({ responder_id: responder.id, method: 'sms', simulated: entry.simulated, ok: entry.ok, accept_url: url });
  }
  return result;
}

function resolveToken(token) {
  const record = tokenRecords.get(hashToken(token));
  if (!record || record.expiresAt < Date.now()) return null;
  return record;
}

function getDispatchLog() { return dispatchLog.map(({ token_hash, ...row }) => ({ ...row, token_hash })); }
function resetDispatch() { tokenRecords.clear(); dispatchLog.length = 0; }
module.exports = { dispatchEvent, resolveToken, getDispatchLog, resetDispatch };
