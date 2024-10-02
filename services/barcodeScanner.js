const HID = require('node-hid');
const { sendWebhook } = require('../webhook');

// You may need to adjust these values based on your specific barcode scanner
const VENDOR_ID = 0x0000;  // Replace with your scanner's vendor ID
const PRODUCT_ID = 0x0000; // Replace with your scanner's product ID

function start() {
    console.log('Searching for barcode scanner...');

    let devices = HID.devices();
    console.log(devices);
    let deviceInfo = devices.find(d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);

    if (!deviceInfo) {
        console.error('Barcode scanner not found. Please check the VENDOR_ID and PRODUCT_ID.');
        return;
    }

    let device = new HID.HID(deviceInfo.path);
    console.log('Barcode scanner connected and ready.');

    let buffer = '';

    device.on('data', (data) => {
        // Most barcode scanners will send the entire code at once
        let scannedData = data.toString('ascii').replace(/\u0000/g, '').trim();
        
        if (scannedData) {
            console.log('Barcode scanned:', scannedData);

            // Send Discord webhook notification
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