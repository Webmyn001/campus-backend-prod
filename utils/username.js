// The profile form strips "://" and dots, so a pasted link arrives as e.g. "httpsmystorevercelapp".
const WEBSITE_PREFIX = /^(https?|www)/i;
const WEBSITE_SUFFIX = /\.(com|ng|net|org|io|co|app|store|shop|site|online|xyz|me|biz|info)$/i;
const HOSTING_WORDS = /(vercel|netlify|herokuapp|onrender|github\.?io|wixsite|myshopify|linktr\.?ee)/i;

const WEBSITE_USERNAME_MESSAGE =
    "Usernames cannot be website links. Pick a short store name such as mystore.";

function looksLikeWebsite(username) {
    if (typeof username !== "string") return false;
    const value = username.trim();
    return (
        value.includes("://") ||
        WEBSITE_PREFIX.test(value) ||
        WEBSITE_SUFFIX.test(value) ||
        HOSTING_WORDS.test(value)
    );
}

module.exports = { looksLikeWebsite, WEBSITE_USERNAME_MESSAGE };
