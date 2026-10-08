const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const truthy = value => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
const provider = String(process.env.PROVIDER || 'mock').toLowerCase();
if (!['mock', 'twilio'].includes(provider)) throw new Error('PROVIDER must be mock or twilio');

module.exports = {
  demoMode: truthy(process.env.DEMO_MODE ?? 'true'),
  provider,
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  port: Number(process.env.PORT || 3000),
  escalateAfterS: Number(process.env.ESCALATE_AFTER_S || 20),
  whitelist: (process.env.DEMO_WHITELIST || '').split(',').map(x => x.trim()).filter(Boolean)
};
