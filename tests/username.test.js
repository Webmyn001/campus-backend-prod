const test = require("node:test");
const assert = require("node:assert/strict");
const { looksLikeWebsite } = require("../utils/username");

test("flags pasted website links, raw or stripped", () => {
    for (const value of [
        "https://mystore.vercel.app",
        "httpsmystiquestorephivercelapp",
        "www.mystore.com",
        "wwwmystorecom",
        "mystore.com.ng",
        "mystorenetlifyapp",
    ]) {
        assert.equal(looksLikeWebsite(value), true, value);
    }
});

test("allows normal store names", () => {
    for (const value of ["mystiqueworld", "john.doe", "ada_store", "campuscrave", "comfort", "shopwithme"]) {
        assert.equal(looksLikeWebsite(value), false, value);
    }
});
