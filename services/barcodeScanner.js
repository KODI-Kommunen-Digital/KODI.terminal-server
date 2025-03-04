const { GlobalKeyboardListener } = require("node-global-key-listener");
const { sendWebhook } = require('../webhook');

const v = new GlobalKeyboardListener();

let inputBuffer = '';
let timeoutId = null;

// We'll track SHIFT presses ourselves
let shiftPressed = false;

function handleInput(e) {

  // Cancel the existing timeout because we’re building a code
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  let typedChar = null;

  // --- 1) If the user/scanner pressed SHIFT (down/up) ---
  if ((e.name === 'LEFT SHIFT' || e.name === 'RIGHT SHIFT')) {
    if (e.state === 'DOWN') {
      shiftPressed = true;
    } else if (e.state === 'UP') {
      shiftPressed = false;
    }
    // We don't actually append SHIFT itself to the buffer, so exit
    return;
  }

  // --- 2) For everything else, check if it's a key-down event ---
  if (e.state === 'DOWN') {
    // If e.character is one printable character, we can use it
    if (e.character && e.character.length === 1) {
      typedChar = e.character;
    } else {
      // Fallback for special keys
      switch (e.name) {
        // If your scanner truly sends SHIFT + DOT for a colon, map it here
        case 'DOT':
          typedChar = shiftPressed ? ':' : '.';
          break;

        // If you see letters come in as separate SHIFT + letter events:
        // (In your logs, letters come in with name='C', etc., but with no isShifted.)
        // If SHIFT is pressed, transform to uppercase, else lowercase.
        case 'A': case 'B': case 'C': case 'D': case 'E': case 'F':
        case 'G': case 'H': case 'I': case 'J': case 'K': case 'L':
        case 'M': case 'N': case 'O': case 'P': case 'Q': case 'R':
        case 'S': case 'T': case 'U': case 'V': case 'W': case 'X':
        case 'Y': case 'Z':
          typedChar = shiftPressed ? e.name.toUpperCase() : e.name.toLowerCase();
          break;

        // If you see digits come in with name='1','2','3'..., just use them
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
          typedChar = e.name;
          break;

        default:
          // If it's a single-character name, use it as-is
          if (e.name && e.name.length === 1) {
            typedChar = e.name;
          }
          break;
      }
    }
  }

  if (typedChar) {
    inputBuffer += typedChar;
  }

  timeoutId = setTimeout(() => {
    if (inputBuffer.length > 0) {
      console.log('Barcode scanned:', inputBuffer);

      sendWebhook({ barcodeData: inputBuffer }, 'barcode')
        .then(() => console.log('Webhook sent successfully for product scan'))
        .catch(error => console.error('Error sending webhook for product scan:', error));

      inputBuffer = '';
    }
  }, 100);
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
  v.kill();const { GlobalKeyboardListener } = require("node-global-key-listener");
  const { sendWebhook } = require('../webhook');
  
  const v = new GlobalKeyboardListener();
  
  let inputBuffer = '';
  let timeoutId = null;
  
  // Track SHIFT presses ourselves
  let shiftPressed = false;
  
  function handleInput(e) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  
    let typedChar = null;
  
    // 1) Handle SHIFT presses
    if (e.name === 'LEFT SHIFT' || e.name === 'RIGHT SHIFT') {
      if (e.state === 'DOWN') {
        shiftPressed = true;
      } else if (e.state === 'UP') {
        shiftPressed = false;
      }
      // We don't append SHIFT itself; just return
      return;
    }
  
    // 2) Only process other keys on key-down
    if (e.state === 'DOWN') {
      // If there's a direct single character, use it
      if (e.character && e.character.length === 1) {
        typedChar = e.character;
      } else {
        // Fallback mapping
        switch (e.name) {
          // For scanners sending SHIFT+DOT => `:`
          case 'DOT':
            typedChar = shiftPressed ? ':' : '.';
            break;
  
          // Handle letters (uppercase if SHIFT is pressed)
          case 'A': case 'B': case 'C': case 'D': case 'E': case 'F':
          case 'G': case 'H': case 'I': case 'J': case 'K': case 'L':
          case 'M': case 'N': case 'O': case 'P': case 'Q': case 'R':
          case 'S': case 'T': case 'U': case 'V': case 'W': case 'X':
          case 'Y': case 'Z':
            typedChar = shiftPressed
              ? e.name.toUpperCase()
              : e.name.toLowerCase();
            break;
  
          // Digits
          case '0': case '1': case '2': case '3': case '4':
          case '5': case '6': case '7': case '8': case '9':
            typedChar = e.name;
            break;
  
          default:
            // If it's a single-character key name we haven't mapped above
            if (e.name && e.name.length === 1) {
              typedChar = e.name;
            }
            break;
        }
      }
    }
  
    // 3) If we captured a character, append it to our buffer
    if (typedChar) {
      inputBuffer += typedChar;
    }
  
    // 4) Send the buffer after a short delay, treating it as one scanned code
    timeoutId = setTimeout(() => {
      if (inputBuffer.length > 0) {
        console.log('Barcode scanned:', inputBuffer);
  
        sendWebhook({ barcodeData: inputBuffer }, 'barcode')
          .then(() => console.log('Webhook sent successfully for product scan'))
          .catch(error => console.error('Error sending webhook for product scan:', error));
  
        inputBuffer = '';
      }
    }, 100); // Adjust delay if needed
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
  
  module.exports = { start };
  
  console.log('Stopping barcode scanner...');
  process.exit();
});

module.exports = { start };
