const test = require("node:test");
const assert = require("node:assert/strict");
const { clientBaseUrl, CANONICAL_CLIENT_URL } = require("../utils/clientUrl");

function withClientUrl(value, fn) {
  const previous = process.env.CLIENT_URL;
  if (value === undefined) delete process.env.CLIENT_URL;
  else process.env.CLIENT_URL = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = previous;
  }
}

test("clientBaseUrl falls back to the canonical domain", () => {
  withClientUrl(undefined, () => assert.equal(clientBaseUrl(), CANONICAL_CLIENT_URL));
});

test("clientBaseUrl migrates the legacy domain", () => {
  withClientUrl("https://www.campuscrave.ng", () => assert.equal(clientBaseUrl(), CANONICAL_CLIENT_URL));
  withClientUrl("https://campuscrave.ng/", () => assert.equal(clientBaseUrl(), CANONICAL_CLIENT_URL));
});

test("clientBaseUrl keeps a valid configured domain", () => {
  withClientUrl("https://www.campuscrave.com.ng/", () => assert.equal(clientBaseUrl(), "https://www.campuscrave.com.ng"));
  withClientUrl("https://staging.campuscrave.com.ng", () =>
    assert.equal(clientBaseUrl(), "https://staging.campuscrave.com.ng")
  );
});

test("clientBaseUrl rejects insecure or malformed values", () => {
  withClientUrl("http://campuscrave.com.ng", () => assert.equal(clientBaseUrl(), CANONICAL_CLIENT_URL));
  withClientUrl("not a url", () => assert.equal(clientBaseUrl(), CANONICAL_CLIENT_URL));
});
