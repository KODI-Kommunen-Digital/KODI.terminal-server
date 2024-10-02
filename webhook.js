const axios = require('axios');
require("dotenv").config();


async function sendWebhook(data, type) {
    let payloadData;
    let webhookUrl = `http://localhost:${process.env.WEBHOOK_PORT}/publish/${type}?accessToken=${process.env.ACCESS_TOKEN}`;

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
    
    console.log(webhookUrl, payload)

    try {
        let response = await axios.post(webhookUrl, 
            payload, 
            { headers: { 'Content-Type': 'application/json' } }
        );
        return response;
    }
    catch (error) {
        throw error;
    }
}

module.exports = { sendWebhook };
