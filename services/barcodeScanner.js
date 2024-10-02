require('dotenv').config();
const HID = require('node-hid');
const { sendWebhook } = require('../webhook');

const VENDOR_ID = parseInt(process.env.BARCODE_SCANNER_VENDOR_ID);
const PRODUCT_ID = parseInt(process.env.BARCODE_SCANNER_PRODUCT_ID);

function start() {
    console.log('Searching for barcode scanner...');

    if (isNaN(VENDOR_ID) || isNaN(PRODUCT_ID)) {
        console.error('Invalid VENDOR_ID or PRODUCT_ID. Please check your .env file.');
        return;
    }

    let devices = HID.devices();
    let deviceInfo = devices.find(d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);

    if (!deviceInfo) {
        console.error('Barcode scanner not found. Please check the VENDOR_ID and PRODUCT_ID in your .env file.');
        return;
    }

    let device = new HID.HID(deviceInfo.path);
    console.log('Barcode scanner connected and ready.');

    device.on('data', (data) => {
        let scannedData = data.toString('ascii').replace(/\u0000/g, '').trim();
        
        if (scannedData) {
            console.log('Barcode scanned:', scannedData);

            sendWebhook({ barcodeData: scannedData }, 'barcode')
                .then(() => console.log('Webhook sent successfully for product scan'))
                .catch(error => console.error('Error sending webhook for product scan:', error));
        }
    });
}

process.on('SIGINT', () => {
    console.log('Stopping barcode scanner...');
    process.exit();
});

module.exports = { start };