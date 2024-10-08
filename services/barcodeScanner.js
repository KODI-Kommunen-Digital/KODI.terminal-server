require('dotenv').config();
const HID = require('node-hid');
const { sendWebhook } = require('../webhook');

const VENDOR_ID = parseInt(process.env.BARCODE_SCANNER_VENDOR_ID);
const PRODUCT_ID = parseInt(process.env.BARCODE_SCANNER_PRODUCT_ID);

let device;

function handleData(data) {
    try {
        let scannedData = Buffer.from(data).toString('utf8').replace(/\u0000/g, '').trim();
        if (scannedData) {
            console.log('Barcode scanned:', scannedData);
            sendWebhook({ barcodeData: scannedData }, 'barcode')
                .then(() => console.log('Webhook sent successfully for product scan'))
                .catch(error => console.error('Error sending webhook for product scan:', error));
        }
    } catch (error) {
        console.error('Error processing scanned data:', error);
    }
}

function start() {
    console.log('Searching for barcode scanner...');

    if (isNaN(VENDOR_ID) || isNaN(PRODUCT_ID)) {
        console.error('Invalid VENDOR_ID or PRODUCT_ID. Please check your .env file.');
        return;
    }

    try {
        let devices = HID.devices();
        console.log('Available HID devices:', devices);

        let deviceInfo = devices.find(d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);

        if (!deviceInfo) {
            console.error('Barcode scanner not found. Please check the VENDOR_ID and PRODUCT_ID in your .env file.');
            console.log('VENDOR_ID:', VENDOR_ID, 'PRODUCT_ID:', PRODUCT_ID);
            return;
        }

        console.log('Found device:', deviceInfo);

        device = new HID.HID(deviceInfo.path);
        console.log('Barcode scanner connected and ready.');

        device.on('data', handleData);
        
        // Use a separate error handler instead of device.on('error', ...)
        device.removeAllListeners('error');
        process.on('uncaughtException', handleError);

    } catch (error) {
        console.error('Error initializing barcode scanner:', error);
        // Attempt to reconnect
        setTimeout(start, 5000);
    }
}

function handleError(error) {
    console.error('Uncaught error:', error);
    if (device) {
        try {
            device.close();
        } catch (closeError) {
            console.error('Error closing device:', closeError);
        }
    }
    // Attempt to reconnect
    setTimeout(start, 5000);
}

process.on('SIGINT', () => {
    console.log('Stopping barcode scanner...');
    if (device) {
        try {
            device.close();
        } catch (error) {
            console.error('Error closing device:', error);
        }
    }
    process.exit();
});

module.exports = { start };