const test = require('node:test');
const assert = require('node:assert/strict');
const { responderTypesFor } = require('./rules');

test('medical routes to hospital', () => assert.deepEqual(responderTypesFor('medical'), ['hospital']));
test('accident routes to hospital and police', () => assert.deepEqual(responderTypesFor('accident'), ['hospital', 'police']));
test('breakdown routes to mechanic', () => assert.deepEqual(responderTypesFor('breakdown'), ['mechanic']));
test('fuel routes to fuel pump', () => assert.deepEqual(responderTypesFor('fuel'), ['fuel_pump']));
test('unknown category is rejected', () => assert.throws(() => responderTypesFor('other'), /invalid_category/));
