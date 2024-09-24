const axios = require('axios');
require("dotenv").config();

const webhookUrl = `http://localhost:${process.env.WEBHOOK_PORT}/publish/barcode?accessToken=${process.env.ACCESS_TOKEN}`;

function sendDiscordWebhook(data, type) {
    return new Promise((resolve, reject) => {
        let embedTitle, fields;

        if (type === 'nfc') {
            embedTitle = 'NFC Card Scanned';
            fields = [{ name: 'UID', value: data.uid }, { name: 'Block Data', value: data.blockData }];
        } else if (type === 'barcode') {
            embedTitle = 'Barcode Scanned';
            fields = [{ name: 'Barcode Data', value: data.barcodeData }];
        } else {
            return reject(new Error('Unknown notification type'));
        }

        const payload = JSON.stringify({
            content: 'New scan detected!',
            embeds: [{ title: embedTitle, color: 5814783, fields: fields }]
        });

        axios.post(webhookUrl, payload, { headers: { 'Content-Type': 'application/json' } })
            .then(response => resolve(response.data))
            .catch(error => reject(error));
    });
}

module.exports = { sendDiscordWebhook };
