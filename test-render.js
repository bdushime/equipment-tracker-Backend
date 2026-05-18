async function testRender() {
    console.log("Sending request to Render...");
    const startTime = Date.now();
    try {
        const res = await fetch('https://equipment-tracker-backend-dfso.onrender.com/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: "bdushime47@gmail.com" })
        });
        const text = await res.text();
        console.log("Response Status:", res.status);
        console.log("Response Body:", text);
    } catch (err) {
        console.error("Error:", err.message);
    }
    console.log("Time taken:", Date.now() - startTime, "ms");
}

testRender();
