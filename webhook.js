const axios = require('axios');
require("dotenv").config();

const webhookUrl = `http://localhost:${process.env.WEBHOOK_PORT}/publish/barcode?accessToken=${process.env.ACCESS_TOKEN}`;

async function sendDiscordWebhook(data, type) {
    console.log(webhookUrl)
    let payloadData;

    if (type === 'nfc') {
        payloadData = {
            uid: data.uid,
            blockData: data.blockData
        }; 
    } else if (type === 'barcode') {
        payloadData = {
            value: data.barcodeData
        };
    } else {
        throw new Error('Unknown notification type');
    }

    const payload = JSON.stringify(payloadData);
    try {
        let response = await axios.post(webhookUrl, 
            { payload }, 
            { headers: { 'Content-Type': 'application/json' } }
        );
        console.log(response);
    }
    catch (error) {
        console.error(error);
        throw error;
    }
}

module.exports = { sendDiscordWebhook };
