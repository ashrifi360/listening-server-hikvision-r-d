const { DigestClient } = require('digest-fetch');
const fetch = require('node-fetch'); 
const fs = require('fs');

// 1. Device Credentials & URL
const username = 'admin';
const password = 'Hik12@34'; // <--- CHANGE THIS TO THE CAMERA PASSWORD
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

        // Every time the camera sends a chunk of XML data, this triggers
        response.body.on('data', (chunk) => {
            const dataString = chunk.toString();
            console.log(`\n[⬇️  DATA INBOUND] Received a ${chunk.length} byte chunk!`);
            
            // Save the raw XML chunk to our text file
            logFile.write(dataString);
            
            // Print a quick preview to the console if it looks like an event
            if (dataString.includes("<subEventType>")) {
                console.log("    -> Event detected! The XML has been appended to the log file.");
            }
        });

        response.body.on('end', () => {
            console.log("[!] The camera closed the stream.");
        });

        response.body.on('error', (err) => {
            console.error("[X] Stream error:", err);
        });
    })
    .catch(err => {
        console.error("[X] Network error:", err.message);
    });