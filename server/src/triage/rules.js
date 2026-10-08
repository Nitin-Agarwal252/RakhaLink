const rules = Object.freeze({
  medical: ['hospital'],
  accident: ['hospital', 'police'],
  breakdown: ['mechanic'],
  fuel: ['fuel_pump']
});

function responderTypesFor(category) {
  const types = rules[category];
  if (!types) throw new TypeError('invalid_category');
  return [...types];
}

module.exports = { responderTypesFor, rules };
