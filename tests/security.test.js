const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_IMAGE_BYTES, normalizeImagePayload, validateImageCollection } = require("../utils/images");
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

const imagePayload = bytes => `data:image/png;base64,${Buffer.alloc(bytes).toString("base64")}`;

test("four photos may use exactly 4 MB combined", () => {
  assert.doesNotThrow(() => validateImageCollection(Array(4).fill(imagePayload(MAX_IMAGE_BYTES / 4))));
});

test("photo collection rejects combined size above 4 MB", () => {
  assert.throws(() => validateImageCollection([imagePayload(MAX_IMAGE_BYTES / 2), imagePayload(MAX_IMAGE_BYTES / 2 + 1)]), /4 MB/);
});

test("photo collection rejects a fifth photo and non-array input", () => {
  assert.throws(() => validateImageCollection(Array(5).fill(imagePayload(1))), /4 photos/);
  assert.throws(() => validateImageCollection("not an array"), /array/);
});

test("single images reject oversized and unsupported uploads", () => {
  assert.throws(() => normalizeImagePayload(imagePayload(MAX_IMAGE_BYTES + 1)), /4 MB/);
  assert.throws(() => validateImageCollection(["data:image/svg+xml;base64,PHN2Zz4="]), /Only PNG/);
});

test("photo byte accounting handles base64 padding", () => {
  assert.doesNotThrow(() => validateImageCollection([imagePayload(MAX_IMAGE_BYTES - 1), imagePayload(1)]));
});

test("invalid photo collections are rejected before any upload", async (t) => {
  const cloudinary = require("../config/cloudinary");
  const { normalizeListingImages } = require("../utils/listings");
  const upload = t.mock.method(cloudinary.uploader, "upload", async () => { throw new Error("Unexpected upload"); });
  await assert.rejects(normalizeListingImages([imagePayload(MAX_IMAGE_BYTES / 2), imagePayload(MAX_IMAGE_BYTES / 2 + 1)]), /4 MB/);
  await assert.rejects(normalizeListingImages(Array(5).fill(imagePayload(1))), /4 images/);
  assert.equal(upload.mock.callCount(), 0);
});

test("toSafeInt clamps to the provided range", () => {
  assert.equal(toSafeInt("5", 0, 1, 10), 5);
  assert.equal(toSafeInt("50", 0, 1, 10), 0);
  assert.equal(toSafeInt("nope", 3, 1, 10), 3);
});
