const { sendDiscordWebhook } = require('./webhook');
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
        sendDiscordWebhook({ barcodeData: input }, 'barcode')
            .then(() => console.log('Discord webhook sent successfully for product scan'))
            .catch(error => console.error('Error sending Discord webhook for product scan:', error));
    });
}

module.exports = { start };