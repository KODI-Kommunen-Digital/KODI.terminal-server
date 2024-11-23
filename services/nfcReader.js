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

    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
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

            reader.on('status', function (status) {
                try {
                    const changes = this.state ^ status.state;
                    if (changes && (changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                        log('Card inserted');

                        const connectOptions = {
                            share_mode: reader.SCARD_SHARE_SHARED,
                            protocol: reader.SCARD_PROTOCOL_T0 | reader.SCARD_PROTOCOL_T1,
                        };

                        reader.connect(connectOptions, function (err, protocol) {
                            if (err) {
                                log(`Connection error: ${err}`, 'ERROR');
                                return;
                            }

                            try {
                                if (![reader.SCARD_PROTOCOL_T0, reader.SCARD_PROTOCOL_T1].includes(protocol)) {
                                    log(`Invalid protocol received: ${protocol}`, 'ERROR');
                                    return;
                                }

                                log(`Connected successfully with protocol: ${protocol}`);

                                // Get UID command
                                const getUIDCommand = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
                                log(`Sending Get UID command: ${getUIDCommand.toString('hex')}`);

                                reader.transmit(getUIDCommand, 40, protocol, function (err, data) {
                                    if (err) {
                                        log(`Error getting UID: ${err}`, 'ERROR');
                                        return;
                                    }

                                    try {
                                        const uid = data.subarray(0, data.length - 2).toString('hex');
                                        log(`Card UID: ${uid}`);

                                        // Read data from block 4
                                        const readDataCommand = Buffer.from([0xFF, 0xB0, 0x00, 0x04, 0x10]);
                                        log(`Sending Read Data command: ${readDataCommand.toString('hex')}`);

                                        reader.transmit(readDataCommand, 40, protocol, function (err, data) {
                                            if (err) {
                                                log(`Error reading data: ${err}`, 'ERROR');
                                                return;
                                            }

                                            try {
                                                const blockData = data.subarray(0, data.length - 2).toString('hex');
                                                log(`Data from card (Block 4): ${blockData}`);

                                                // Send Webhook notification
                                                sendWebhook({ uid, blockData }, 'nfc')
                                                    .then(() => log('Webhook sent successfully'))
                                                    .catch((error) => log(`Error sending Webhook: ${error}`, 'ERROR'));
                                            } catch (error) {
                                                log(`Unexpected error processing card data: ${error}`, 'ERROR');
                                            }

                                            // Disconnect after reading
                                            reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
                                                if (err) {
                                                    log(`Error disconnecting: ${err}`, 'ERROR');
                                                } else {
                                                    log('Card disconnected successfully');
                                                }
                                            });
                                        });
                                    } catch (error) {
                                        log(`Unexpected error getting UID: ${error}`, 'ERROR');
                                    }
                                });
                            } catch (error) {
                                log(`Unexpected error during connect operation: ${error}`, 'ERROR');
                            }
                        });
                    }
                } catch (error) {
                    log(`Unexpected error handling card status: ${error}`, 'ERROR');
                }
            });

            reader.on('end', function () {
                log('Reader removed');
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
