const { sendWebhook } = require('../webhook');
const readline = require('readline');

function start() {
    console.log('Barcode scanner (keyboard input) is ready...');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let buffer = '';
    const timeoutDuration = 1000; // milliseconds
    let timeoutId;

    rl.input.on('data', (chunk) => {
        buffer += chunk.toString();
        
        clearTimeout(timeoutId);
        
        timeoutId = setTimeout(() => {
            if (buffer.trim()) {
                console.log('Barcode scanned:', buffer.trim());
                
                // Send Discord webhook notification
                sendWebhook({ barcodeData: buffer.trim() }, 'barcode')
                    .then(() => console.log('Webhook sent successfully for product scan'))
                    .catch(error => console.error('Error sending webhook for product scan:', error));
                
                buffer = '';
            }
        }, timeoutDuration);
    });
}

module.exports = { start };