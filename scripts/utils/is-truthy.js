function isTruthy(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

module.exports = { isTruthy };

