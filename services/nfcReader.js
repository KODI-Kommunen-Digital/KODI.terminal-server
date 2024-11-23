const pcsclite = require('pcsclite');
const { sendWebhook } = require('../webhook');
const fs = require('fs');
const path = require('path');
const debounce = require('lodash.debounce');

let pcsc;
let isReaderAvailable = false;
let isProcessingCard = false;

const logDir = path.join(__dirname, '..', 'logs', 'nfcReader');

function getLogFilename() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = now.toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = now.getFullYear();
    return path.join(logDir, `${day}${month}${year}.log`);
}

function log(message, severity = 'INFO') {
    try {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} - ${severity}: ${message}\n`;
        const logFile = getLogFilename();

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_FILE_SIZE) {
            fs.truncateSync(logFile); // Truncate log file if too large
        }

        fs.appendFileSync(logFile, logMessage);
    } catch (err) {
        console.error('Error writing to log file:', err);
    }
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

    pcsc.on('reader', function (reader) {
        try {
            log(`Reader detected: ${reader.name}`);

            reader.on('error', function (err) {
                log(`Reader error: ${err.message}`, 'ERROR');
            });

            const handleStatusChange = debounce(function (status) {
                try {
                    const changes = this.state ^ status.state;

                    if (changes && (changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                        if (isProcessingCard) {
                            log('Card already being processed. Ignoring duplicate scan.', 'WARN');
                            return;
                        }

                        isProcessingCard = true;
                        log('Card inserted');

                        const connectOptions = {
                            share_mode: reader.SCARD_SHARE_SHARED,
                            protocol: reader.SCARD_PROTOCOL_T0 | reader.SCARD_PROTOCOL_T1,
                        };

                        reader.connect(connectOptions, function (err, protocol) {
                            if (err) {
                                log(`Connection error: ${err}`, 'ERROR');
                                isProcessingCard = false;
                                return;
                            }
                        
                            try {
                                // Log the protocol or indicate if it's undefined
                                if (protocol === undefined) {
                                    log(`Protocol received is undefined. This indicates a potential communication issue.`, 'ERROR');
                                    isProcessingCard = false;
                        
                                    // Gracefully disconnect and reset the reader
                                    reader.disconnect(reader.SCARD_RESET_CARD, function (disconnectErr) {
                                        if (disconnectErr) {
                                            log(`Error during reader reset after undefined protocol: ${disconnectErr}`, 'ERROR');
                                        } else {
                                            log('Reader reset successfully after undefined protocol.', 'INFO');
                                        }
                                    });
                                    return;
                                }
                        
                                log(`Connected successfully. Protocol: ${protocol}`);
                        
                                // Ensure the protocol is valid
                                if (![reader.SCARD_PROTOCOL_T0, reader.SCARD_PROTOCOL_T1].includes(protocol)) {
                                    log(`Invalid protocol received: ${protocol}. Supported protocols are T=0 and T=1.`, 'ERROR');
                                    isProcessingCard = false;
                                    reader.disconnect(reader.SCARD_RESET_CARD, function (disconnectErr) {
                                        if (disconnectErr) {
                                            log(`Error disconnecting after invalid protocol: ${disconnectErr}`, 'ERROR');
                                        }
                                    });
                                    return;
                                }
                        
                                // Proceed with operations if protocol is valid
                                const getUIDCommand = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
                                log(`Sending Get UID command: ${getUIDCommand.toString('hex')}`);
                        
                                reader.transmit(getUIDCommand, 40, protocol, function (err, data) {
                                    if (err) {
                                        log(`Error getting UID: ${err}`, 'ERROR');
                                        isProcessingCard = false;
                                        return;
                                    }
                        
                                    try {
                                        const uid = data.subarray(0, data.length - 2).toString('hex');
                                        log(`Card UID: ${uid}`);
                        
                                        const readDataCommand = Buffer.from([0xFF, 0xB0, 0x00, 0x04, 0x10]);
                                        log(`Sending Read Data command: ${readDataCommand.toString('hex')}`);
                        
                                        reader.transmit(readDataCommand, 40, protocol, function (err, data) {
                                            if (err) {
                                                log(`Error reading data: ${err}`, 'ERROR');
                                                isProcessingCard = false;
                                                return;
                                            }
                        
                                            try {
                                                const blockData = data.subarray(0, data.length - 2).toString('hex');
                                                log(`Data from card (Block 4): ${blockData}`);
                        
                                                sendWebhook({ uid, blockData }, 'nfc')
                                                    .then(() => log('Webhook sent successfully'))
                                                    .catch((error) => log(`Error sending Webhook: ${error}`, 'ERROR'))
                                                    .finally(() => {
                                                        try {
                                                            isProcessingCard = false;
                                                            reader.disconnect(reader.SCARD_LEAVE_CARD, function (disconnectErr) {
                                                                if (disconnectErr) {
                                                                    log(`Error disconnecting: ${disconnectErr}`, 'ERROR');
                                                                } else {
                                                                    log('Card disconnected successfully');
                                                                }
                                                            });
                                                        } catch (error) {
                                                            log(`Error during disconnection: ${error}`, 'ERROR');
                                                        }
                                                    });
                                            } catch (error) {
                                                log(`Error processing card data: ${error}`, 'ERROR');
                                                isProcessingCard = false;
                                            }
                                        });
                                    } catch (error) {
                                        log(`Error getting UID: ${error}`, 'ERROR');
                                        isProcessingCard = false;
                                    }
                                });
                            } catch (error) {
                                log(`Unexpected error during connect operation: ${error}`, 'ERROR');
                                isProcessingCard = false;
                            }
                        });
                        
                        
                    }
                } catch (error) {
                    log(`Unexpected error handling card status: ${error}`, 'ERROR');
                }
            }, 500); // Debounce by 500ms to prevent duplicate scans

            reader.on('status', handleStatusChange);

            reader.on('end', function () {
                try {
                    log('Reader removed');
                } catch (error) {
                    log(`Error handling reader removal: ${error}`, 'ERROR');
                }
            });
        } catch (error) {
            log(`Unexpected error handling reader events: ${error}`, 'ERROR');
        }
    });

    pcsc.on('error', function (err) {
        try {
            log(`PCSC error: ${err.message}`, 'ERROR');
            isReaderAvailable = false;
            log('NFC functionality will be disabled', 'WARN');
        } catch (error) {
            console.error('Unexpected error handling PCSC error:', error);
        }
    });
}

function isNFCAvailable() {
    return isReaderAvailable;
}

module.exports = { start, isNFCAvailable };
