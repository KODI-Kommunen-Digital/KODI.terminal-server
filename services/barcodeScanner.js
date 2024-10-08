require('dotenv').config();
const HID = require('node-hid');
const { sendWebhook } = require('../webhook');
const { EventEmitter } = require('events');

// Create a basic EventEmitter for the HID
class HIDDevice extends EventEmitter {
    constructor(vendorId, productId) {
        super();
        this.vendorId = vendorId;
        this.productId = productId;
        this.device = null;
        this.connect();
    }

    connect() {
        try {
            let devices = HID.devices();
            let deviceInfo = devices.find(d => d.vendorId === this.vendorId && d.productId === this.productId);
            
            if (!deviceInfo) {
                console.error('Barcode scanner not found.');
                return;
            }

            this.device = new HID.HID(deviceInfo.path);
            console.log('Barcode scanner connected.');
            this.device.on('data', this.handleData.bind(this));
            this.device.on('error', this.handleError.bind(this));

        } catch (error) {
            console.error('Error initializing barcode scanner:', error);
        }
    }

    handleData(data) {
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

    handleError(error) {
        console.error('Barcode scanner error:', error);
        if (this.device) {
            try {
                this.device.close();
            } catch (closeError) {
                console.error('Error closing HID device:', closeError);
            }
        }
        setTimeout(() => this.connect(), 5000); // Reconnect after 5 seconds
    }
}

// Start function to initialize and export
function start() {
    const VENDOR_ID = parseInt(process.env.BARCODE_SCANNER_VENDOR_ID);
    const PRODUCT_ID = parseInt(process.env.BARCODE_SCANNER_PRODUCT_ID);

    if (!isNaN(VENDOR_ID) && !isNaN(PRODUCT_ID)) {
        const scanner = new HIDDevice(VENDOR_ID, PRODUCT_ID);
    } else {
        console.error('Invalid VENDOR_ID or PRODUCT_ID. Please check your .env file.');
    }
}

module.exports = { start };
