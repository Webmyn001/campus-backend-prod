const axios = require('axios');

const BACKEND_URL = "http://localhost:5000/api";
// Use a known identifier or a test one. 
// Note: This script assumes the server is running locally on port 5000.
const TEST_IDENTIFIER = "test-user"; // Replace with a real username/ID for actual testing

async function testOGPreview() {
    console.log(`Testing OG Preview for: ${TEST_IDENTIFIER}`);
    const url = `${BACKEND_URL}/public/store/${TEST_IDENTIFIER}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'WhatsApp/2.21.12.21 A' // Simulate a bot
            }
        });

        const html = response.data;
        console.log("Response received.");

        const checks = [
            { name: "OG Title", pattern: /<meta property="og:title" content="([^"]+)"/ },
            { name: "OG Description", pattern: /<meta property="og:description" content="([^"]+)"/ },
            { name: "OG Image", pattern: /<meta property="og:image" content="([^"]+)"/ },
            { name: "OG URL", pattern: /<meta property="og:url" content="([^"]+)"/ },
            { name: "Redirect Script", pattern: /window\.location\.replace\("([^"]+)"\)/ }
        ];

        let allPassed = true;
        checks.forEach(check => {
            const match = html.match(check.pattern);
            if (match) {
                console.log(`✅ ${check.name}: ${match[1]}`);
            } else {
                console.log(`❌ ${check.name} NOT FOUND`);
                allPassed = false;
            }
        });

        if (allPassed) {
            console.log("\n✨ All OG tags and redirect logic verified!");
        } else {
            console.log("\n⚠️ Some checks failed. Ensure the server is running and the identifier exists.");
        }

    } catch (error) {
        console.error("Test failed:", error.message);
        if (error.response) {
            console.error("Status:", error.response.status);
        }
    }
}

testOGPreview();
