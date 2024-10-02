const axios = require('axios');
require("dotenv").config();


async function sendWebhook(data, type) {
    let payloadData;
    let webhookUrl = `http://localhost:${process.env.WEBHOOK_PORT}/publish/${type}?accessToken=${process.env.ACCESS_TOKEN}`;
    console.log(webhookUrl)

    if (type === 'nfc') {
        payloadData = {
            uid: data.uid,
            blockData: data.blockData
        }; 
    } else if (type === 'barcode') {
        payloadData = {
            value: data.barcodeData
        };
    } else if (type === 'cashreader') {
        payloadData = {
            value: data
        };
    } else {
        throw new Error('Unknown notification type');
    }

    const payload = JSON.stringify(payloadData);
    try {
        let response = await axios.post(webhookUrl, 
            payload, 
            { headers: { 'Content-Type': 'application/json' } }
        );
        console.log(response);
    }
    catch (error) {
        console.error(error);
        throw error;
    }
}

module.exports = { sendWebhook };
