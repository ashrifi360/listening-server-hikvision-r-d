const { DigestClient } = require('digest-fetch');
const fetch = require('node-fetch');
const fs = require('fs');

// 1. Device Credentials & URL
const username = 'admin';
const password = 'Hik12@34'; 
const deviceUrl = 'http://192.168.1.39/ISAPI/Event/notification/alertStream';

// 2. Initialize the Digest Auth client
const client = new DigestClient(username, password, { basic: false });

// 3. Create a text file to save the raw XML data
const logFileName = 'isapi_alcohol_logs.txt';
const logFile = fs.createWriteStream(logFileName, { flags: 'a' });

console.log(`[!] Connecting to ISAPI Alert Stream at ${deviceUrl}...`);

// 4. Connect and listen to the stream
client.fetch(deviceUrl, { method: 'GET' })
    .then(response => {
        if (!response.ok) {
            console.error(`[X] Connection failed: ${response.status} ${response.statusText}`);
            console.error("    Did you put in the correct admin password?");
            return;
        }

        console.log(`[+] Successfully bypassed Digest Auth (Status: ${response.status})!`);
        console.log(`[+] Stream is OPEN. Writing data to ${logFileName}...`);
        console.log(`[+] Walk over to the terminal and perform a Face + Alcohol scan!`);

        // In Node 18/20+, fetch returns a Web Stream, not a standard Node event emitter!
        // We use an async iterator to read the chunks as they stream in.
        (async () => {
            try {
                let buffer = Buffer.alloc(0);
                const boundaryMime = Buffer.from('--MIME_boundary');
                const boundarySimple = Buffer.from('--boundary');

                for await (const chunk of response.body) {
                    // Append new chunk to our binary buffer
                    buffer = Buffer.concat([buffer, chunk]);
                    console.log(`\n[⬇ DATA INBOUND] Received a ${chunk.length} byte chunk! (Buffer size: ${buffer.length})`);

                    // Write raw data to log (keep it as binary for safety)
                    logFile.write(chunk);

                    // Search for boundaries in the binary buffer
                    let bMimeIdx = buffer.indexOf(boundaryMime);
                    let bSimpleIdx = buffer.indexOf(boundarySimple);
                    let boundaryIdx = (bMimeIdx !== -1 && (bSimpleIdx === -1 || bMimeIdx < bSimpleIdx)) ? bMimeIdx : bSimpleIdx;
                    let boundaryLen = (boundaryIdx === bMimeIdx) ? boundaryMime.length : boundarySimple.length;

                    while (boundaryIdx !== -1) {
                        // Extract the part BEFORE the boundary
                        const part = buffer.slice(0, boundaryIdx);

                        // Move the buffer pointer past the boundary
                        buffer = buffer.slice(boundaryIdx + boundaryLen);

                        console.log("    [◎] Boundary found! Processing segment...");

                        const partString = part.toString('utf-8');
                        if (partString.includes('application/json')) {
                            // Find the first { and the last }
                            const startIdx = partString.indexOf('{');
                            const endIdx = partString.lastIndexOf('}');

                            if (startIdx !== -1 && endIdx !== -1) {
                                const jsonStr = partString.substring(startIdx, endIdx + 1);
                                try {
                                    const json = JSON.parse(jsonStr);
                                    const event = json.AccessControllerEvent || {};

                                    if (event.alcoholDetectionInfo) {
                                        const info = event.alcoholDetectionInfo;

                                        // Find the concentration in all possible spots
                                        let concentration = '0.0';
                                        if (info.concentrationInfo && info.concentrationInfo.concentration !== undefined) {
                                            concentration = info.concentrationInfo.concentration;
                                        } else if (info.alcoholValue !== undefined) {
                                            concentration = info.alcoholValue;
                                        }

                                        const unit = (info.concentrationInfo && info.concentrationInfo.unit) || 'mg/100mL';

                                        console.log("\n" + "╔" + "═".repeat(38) + "╗");
                                        console.log("║  ALCOHOL SCAN DETECTED!             ║");
                                        console.log(`║    Result: ${String(info.result || info.alcoholStatus || 'Unknown').padEnd(20)}║`);
                                        console.log(`║    Value:  ${String(concentration).padEnd(5)} ${String(unit).padEnd(14)}║`);
                                        console.log("╚" + "═".repeat(38) + "╝");
                                    } else {
                                        console.log("\n[✨ EXTRACTED JSON FROM STREAM ✨]");
                                        console.log(JSON.stringify(json, null, 2));
                                    }
                                } catch (e) {
                                    // Only log if it really looks like a failed JSON block
                                    if (jsonStr.length > 10) {
                                        console.log("\n[!] JSON PARSE ERROR - RAW DATA:");
                                        console.log("--- START BLOCK ---");
                                        console.log(jsonStr);
                                        console.log("--- END BLOCK ---");
                                    }
                                }
                            }
                        }

                        // Look for the next boundary in the remaining buffer
                        bMimeIdx = buffer.indexOf(boundaryMime);
                        bSimpleIdx = buffer.indexOf(boundarySimple);
                        boundaryIdx = (bMimeIdx !== -1 && (bSimpleIdx === -1 || bMimeIdx < bSimpleIdx)) ? bMimeIdx : bSimpleIdx;
                        boundaryLen = (boundaryIdx === bMimeIdx) ? boundaryMime.length : boundarySimple.length;
                    }
                }
                console.log("[!] The camera closed the stream.");
            } catch (err) {
                console.error("[X] Stream error:", err);
            }
        })();
    })
    .catch(err => {
        console.error("[X] Network error:", err.message);
    });