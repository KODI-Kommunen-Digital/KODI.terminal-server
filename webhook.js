// discordWebhook.js
const https = require('https');

// const webhookUrl = "https://discord.com/api/webhooks/1225679388561903637/oQWCgz5YU6d1NLV3Czenc_DaBjmFoqslEkUvww4TZuQxOdL8PU-e03iPk-nGrxHq-aHs"
const webhookUrl = "wss://localhost:3001/ws"
function sendDiscordWebhook(data, type) {
    return new Promise((resolve, reject) => {
        let embedTitle, fields;

        if (type === 'nfc') {
            embedTitle = 'NFC Card Scanned';
            fields = [
                {
                    name: 'UID',
                    value: data.uid
                },
                {
                    name: 'Block Data',
                    value: data.blockData
                }
            ];
        } else if (type === 'barcode') {
            embedTitle = 'Barcode Scanned';
            fields = [
                {
                    name: 'Barcode Data',
                    value: data.barcodeData
                }
            ];
        } else {
            reject(new Error('Unknown notification type'));
            return;
        }

        const payload = JSON.stringify({
            content: 'New scan detected!',
            embeds: [{
                title: embedTitle,
                color: 5814783,
                fields: fields
            }]
        });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(webhookUrl, options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                resolve(responseBody);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(payload);
        req.end();
    });
}

module.exports = { sendDiscordWebhook };
