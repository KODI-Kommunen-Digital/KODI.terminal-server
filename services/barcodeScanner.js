require('dotenv').config();
const { sendWebhook } = require('../webhook');
const iohook = require('iohook');

// Barcode buffer to store scanned characters
let barcodeBuffer = [];

// Function to send webhook after barcode is fully scanned
function handleBarcodeScan() {
    const scannedBarcode = barcodeBuffer.join('');
    barcodeBuffer = []; // Clear buffer for the next scan

    console.log(`Barcode scanned: ${scannedBarcode}`);

    // Send the barcode to the webhook
    sendWebhook({ barcodeData: scannedBarcode }, 'barcode')
        .then(() => console.log('Webhook sent successfully for product scan'))
        .catch(error => console.error('Error sending webhook for product scan:', error));
}

// Start function to capture barcode scans globally
function start() {
    console.log("Barcode scanner started...");

    // Global keypress listener
    iohook.on('keydown', event => {
        const key = event.rawcode; // rawcode gives the keycode of the pressed key

        // Capture characters (numbers, letters, etc.)
        if (key >= 48 && key <= 90) { // Letters and numbers
            barcodeBuffer.push(String.fromCharCode(key));
        }

        // Handle "Enter" (assuming the scanner sends Enter at the end of a barcode scan)
        if (key === 13) { // Enter key
            handleBarcodeScan();
        }
    });

    // Start listening for global keypresses
    iohook.start();

    // Gracefully handle termination
    process.on('SIGINT', () => {
        console.log('Stopping barcode scanner...');
        iohook.unload();
        process.exit();
    });
}

// Export the start function
module.exports = { start };
