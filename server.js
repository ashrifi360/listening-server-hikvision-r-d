const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3006;

// Ensure an upload directory exists for face scan images
const uploadDir = path.join(__dirname, "attendance_images");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 1. THE CATCH-ALL LOGGER
app.use((req, res, next) => {
    // Only log the ping, keeping the console clean
    console.log(`\n[NETWORK BING!] Device at ${req.connection.remoteAddress} sent a ${req.method} request to ${req.url}`);
    next();
});

const IsJsonString = (str) => {
    try { JSON.parse(str); return true; } catch (e) { return false; }
};

// 2. PARSE MULTIPART/FORM-DATA (JSON + Image File)
const upload = multer();

app.all("/message", upload.any(), (req, res) => {
    // A. Safely Extract the JSON Metadata
    let eventLogStr = "{}";
    if (req.body?.event_log && IsJsonString(req.body.event_log)) {
        eventLogStr = req.body.event_log;
    } else if (req.body?.AccessControllerEvent && IsJsonString(req.body.AccessControllerEvent)) {
        eventLogStr = req.body.AccessControllerEvent;
    }

    const formData = JSON.parse(eventLogStr);
    console.log("RAW WEBHOOK PAYLOAD:", JSON.stringify(formData, null, 2));
    const eventInfo = formData.AccessControllerEvent || formData;

    // B. Extract the exact keys your firmware uses
    const employeeId = eventInfo.employeeNoString || "Unknown";
    const employeeName = eventInfo.name || "Unknown";
    const scanTime = formData.dateTime || eventInfo.time;
    const subEvent = eventInfo.subEventType;

    // C. Route the logic based on the event type
    const validFaceEvents = [1, 75, 76, 154, 2077];
    if (validFaceEvents.includes(subEvent)) {
        // 75/2077/1 = Success, 76 = Unrecognized Face, 154 = Alcohol/Other Failure
        let alcoholStatus = "";
        let logPrefix = (subEvent === 76 || subEvent === 154) ? "[ SCAN FAILED]" : "[ ATTENDANCE]";

        if (eventInfo.alcoholDetectionInfo) {
            const alcVal = eventInfo.alcoholDetectionInfo.concentrationInfo?.concentrationValue || 0;
            const alcRes = eventInfo.alcoholDetectionInfo.result || "unknown";
            alcoholStatus = ` | Alcohol: ${alcRes.toUpperCase()} (${alcVal} mg/100ml)`;
        }

        console.log(`${logPrefix} ID: ${employeeId} | Name: ${employeeName} | Time: ${scanTime}${alcoholStatus}`);

        // Save the Face Scan Image
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const fileName = `employee_${employeeId}_${Date.now()}.jpg`;
                const filePath = path.join(uploadDir, fileName);
                fs.writeFileSync(filePath, file.buffer);
                console.log(`[+] Saved image: ${fileName}`);
            });
        }
    } else if (subEvent === 21) {
        // 21 = Door Unlocked
        console.log(`[ HARDWARE] Door physically unlocked at ${scanTime}`);
    } else {
        // Anything else (reboots, tampers, mask warnings)
        console.log(`[ SYSTEM EVENT] SubEventType: ${subEvent} at ${scanTime}`);
    }

    // D. Tell the camera we got it
    res.setHeader("Content-Type", "application/json");
    res.send({ status: "RECEIVED" });
});

// 3. START THE SERVER
app.listen(port, "0.0.0.0", () => {
    console.log(`[+] SUPER-CATCHER is running on http://0.0.0.0:${port}`);
    console.log(`[+] Waiting for the terminal to send live scans...`);
});







