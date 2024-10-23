const { GlobalKeyboardListener } = require("node-global-key-listener");
const { sendWebhook } = require('../webhook');

const v = new GlobalKeyboardListener();


let inputBuffer = '';
let timeoutId = null;

function handleInput(e) {

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  // Only add printable characters to the buffer
  if (e.state === "DOWN" && e.name && e.name.length === 1) {
    inputBuffer += e.name;
  }

  timeoutId = setTimeout(() => {
    if (inputBuffer.length > 0) {
      console.log('Barcode scanned:', inputBuffer);
      sendWebhook({ barcodeData: inputBuffer }, 'barcode')
        .then(() => console.log('Webhook sent successfully for product scan'))
        .catch(error => console.error('Error sending webhook for product scan:', error));
      inputBuffer = '';
    }
  }, 100); // Adjust this delay as needed
}

function start() {
  try {
    v.addListener(handleInput);
    console.log('Global barcode scanner listener started. Scanning will work in the background.');
  } catch (error) {
    console.error('Error starting barcode scanner:', error.message);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  v.kill();
  console.log('Stopping barcode scanner...');
  process.exit();
});

// Export the start function
module.exports = { start };
