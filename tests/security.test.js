const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEmail,
  isObjectId,
  parseHttpsUrl,
  escapeRegex,
  timingSafeEqualStrings,
  hashIp,
  escapeHtml,
  toSafeInt,
} = require("../utils/security");

test("normalizeEmail lowercases and validates", () => {
  assert.equal(normalizeEmail("  Student@Campus.EDU "), "student@campus.edu");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(123), null);
});

test("isObjectId accepts only 24 hex characters", () => {
  assert.equal(isObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isObjectId("507f1f77bcf86cd79943901z"), false);
  assert.equal(isObjectId({ $ne: null }), false);
  assert.equal(isObjectId(""), false);
});

test("parseHttpsUrl rejects unsafe URLs", () => {
  assert.ok(parseHttpsUrl("https://www.jumia.com.ng/catalog/"));
  assert.equal(parseHttpsUrl("http://www.jumia.com.ng/"), null);
  assert.equal(parseHttpsUrl("https://user:pass@www.jumia.com.ng/"), null);
  assert.equal(parseHttpsUrl("javascript:alert(1)"), null);
  assert.equal(parseHttpsUrl("https://www.jumia.com.ng/a b"), null);
});

test("escapeRegex neutralises regex metacharacters", () => {
  const pattern = new RegExp(`^${escapeRegex("a.*b")}$`);
  assert.equal(pattern.test("a.*b"), true);
  assert.equal(pattern.test("axxb"), false);
});

test("timingSafeEqualStrings compares safely", () => {
  assert.equal(timingSafeEqualStrings("abc", "abc"), true);
  assert.equal(timingSafeEqualStrings("abc", "abd"), false);
  assert.equal(timingSafeEqualStrings("abc", "abcd"), false);
  assert.equal(timingSafeEqualStrings("", ""), false);
});

test("hashIp is stable and salted", () => {
  process.env.IP_HASH_SALT = "unit-test-salt";
  assert.equal(hashIp("1.2.3.4"), hashIp("1.2.3.4"));
  assert.notEqual(hashIp("1.2.3.4"), hashIp("1.2.3.5"));
  delete process.env.IP_HASH_SALT;
});

test("escapeHtml encodes markup", () => {
  assert.equal(escapeHtml('<script>"x"</script>'), "&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
});

test("toSafeInt clamps to the provided range", () => {
  assert.equal(toSafeInt("5", 0, 1, 10), 5);
  assert.equal(toSafeInt("50", 0, 1, 10), 0);
  assert.equal(toSafeInt("nope", 3, 1, 10), 3);
});
