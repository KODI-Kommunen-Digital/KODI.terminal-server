const pcsclite = require('pcsclite');
const { sendWebhook } = require('../webhook');
const fs = require('fs');
const path = require('path');

let pcsc;
let isReaderAvailable = false;

const logDir = path.join(__dirname, '..', 'logs', 'nfcReader');

function getLogFilename() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = now.toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = now.getFullYear();
    return path.join(logDir, `${day}${month}${year}.log`);
}

function log(message, severity = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${severity}: ${message}\n`;
    const logFile = getLogFilename();
    
    // Ensure the log directory exists
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFile(logFile, logMessage, (err) => {
        if (err) console.error('Error writing to log file:', err);
    });
    
    // Log to console as well
    console.log(logMessage);
}

function start() {
    try {
        pcsc = pcsclite();
        isReaderAvailable = true;
        log('NFC Reader service started successfully');
    } catch (error) {
        log(`Failed to start NFC Reader service: ${error.message}`, 'ERROR');
        isReaderAvailable = false;
        return;
    }

    pcsc.on('reader', function(reader) {
        log(`Reader detected: ${reader.name}`);

        reader.on('error', function(err) {
            log(`Reader error: ${err.message}`, 'ERROR');
        });

        reader.on('status', function(status) {
            const changes = this.state ^ status.state;
            if (changes) {
                if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                    log('Card inserted');
                    reader.connect({ share_mode: this.SCARD_SHARE_SHARED }, function(err, protocol) {
                        if (err) {
                            log(`Connection error: ${err}`, 'ERROR');
                            return;
                        }
                        
                        // Get UID command
                        const getUIDCommand = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
                        reader.transmit(getUIDCommand, 40, protocol, function(err, data) {
                            if (err) {
                                log(`Error getting UID: ${err}`, 'ERROR');
                            } else {
                                const uid = data.toString('hex');
                                log(`Card UID: ${uid}`);
                                
                                // Read data from block 4
                                const readDataCommand = Buffer.from([0xFF, 0xB0, 0x00, 0x04, 0x10]);
                                reader.transmit(readDataCommand, 40, protocol, function(err, data) {
                                    if (err) {
                                        log(`Error reading data: ${err}`, 'ERROR');
                                    } else {
                                        const blockData = data.toString('hex');
                                        log(`Data from card (Block 4): ${blockData}`);
                                        
                                        // Send Webhook notification
                                        sendWebhook({ uid, blockData }, 'nfc')
                                            .then(() => log('Webhook sent successfully'))
                                            .catch(error => log(`Error sending Webhook: ${error}`, 'ERROR'));
                                    }
                                    
                                    // Disconnect after reading
                                    reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
                                        if (err) {
                                            log(`Error disconnecting: ${err}`, 'ERROR');
                                        }
                                    });
                                });
                            }
                        });
                    });
                }
            }
        });

        reader.on('end', function() {
            log('Reader removed');
        });
    });

    pcsc.on('error', function(err) {
        log(`PCSC error: ${err.message}`, 'ERROR');
        isNFCAvailable = false;
        log('NFC functionality will be disabled', 'WARN');
    });
}

function isNFCAvailable() {
    return isNFCAvailable;
}

module.exports = { start, isNFCAvailable };