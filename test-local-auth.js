async function testLocalAuth() {
    console.log("Sending request to local backend...");
    try {
        const res = await fetch('http://localhost:5001/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: "dushimebeni65@gmail.com" })
        });
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Data:", data);
    } catch (err) {
        console.error("Error:", err.message);
    }
}

testLocalAuth();
