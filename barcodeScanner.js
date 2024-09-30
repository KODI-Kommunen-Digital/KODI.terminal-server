const { sendWebhook } = require('./webhook');
const readline = require('readline');

function start() {
    console.log('Barcode scanner (keyboard input) is ready...');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', (input) => {
        console.log('Barcode scanned:', input);
        
        // Send Discord webhook notification
        sendWebhook({ barcodeData: input }, 'barcode')
            .then(() => console.log('Webhook sent successfully for product scan'))
            .catch(error => console.error('Error sending webhook for product scan:', error));
    });
}

module.exports = { start };