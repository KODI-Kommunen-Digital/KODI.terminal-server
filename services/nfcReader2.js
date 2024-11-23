const pcsclite = require('pcsclite');
const { sendWebhook } = require('../webhook');
const fs = require('fs');
const path = require('path');

let pcsc;
let isReaderAvailable = false;
let isProcessingCard = false;
let currentReader = null;  // Track current reader instance

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

        fs.appendFileSync(logFile, logMessage);
        console.log(`${severity}: ${message}`);  // Also log to console
    } catch (err) {
        console.error('Error writing to log file:', err);
    }
}

function cleanupAndReset() {
    isProcessingCard = false;
    if (currentReader) {
        try {
            currentReader.disconnect(currentReader.SCARD_LEAVE_CARD);
        } catch (error) {
            log(`Error during cleanup: ${error.message}`, 'ERROR');
        }
    }
}

function start() {
    try {
        if (pcsc) {
            pcsc.close();
        }
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
            currentReader = reader;

            reader.on('error', function (err) {
                log(`Reader error: ${err.message}`, 'ERROR');
                cleanupAndReset();
            });

            reader.on('status', function (status) {
                try {
                    const changes = this.state ^ status.state;

                    if (changes && (changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                        if (isProcessingCard) {
                            log('Card already being processed. Ignoring duplicate scan.', 'WARN');
                            return;
                        }

                        isProcessingCard = true;
                        log('Card inserted');

                        reader.connect({
                            share_mode: reader.SCARD_SHARE_SHARED,
                            protocol: reader.SCARD_PROTOCOL_T0
                        }, function (err, protocol) {
                            if (err) {
                                log(`Connection error: ${err.message}`, 'ERROR');
                                cleanupAndReset();
                                return;
                            }

                            try {
                                // Ensure we have a valid protocol
                                const activeProtocol = protocol || 1; // Force T0 protocol
                                log(`Connected successfully. Using protocol: T0 (${activeProtocol})`);

                                const getUIDCommand = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
                                log(`Sending Get UID command: ${getUIDCommand.toString('hex')}`);

                                reader.transmit(getUIDCommand, 40, activeProtocol, function (err, data) {
                                    if (err) {
                                        log(`Error getting UID: ${err.message}`, 'ERROR');
                                        cleanupAndReset();
                                        return;
                                    }

                                    try {
                                        const uid = data.subarray(0, data.length - 2).toString('hex');
                                        log(`Card UID: ${uid}`);

                                        sendWebhook({ uid, blockData: null }, 'nfc')
                                            .then(() => log('Webhook sent successfully'))
                                            .catch((error) => log(`Error sending Webhook: ${error.message}`, 'ERROR'))
                                            .finally(() => {
                                                reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
                                                    if (err) {
                                                        log(`Error disconnecting: ${err.message}`, 'ERROR');
                                                    }
                                                    cleanupAndReset();
                                                });
                                            });
                                    } catch (error) {
                                        log(`Error processing card data: ${error.message}`, 'ERROR');
                                        cleanupAndReset();
                                    }
                                });
                            } catch (error) {
                                log(`Error during transmit: ${error.message}`, 'ERROR');
                                cleanupAndReset();
                            }
                        });
                    } else if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
                        log('Card removed');
                        cleanupAndReset();
                    }
                } catch (error) {
                    log(`Error handling status change: ${error.message}`, 'ERROR');
                    cleanupAndReset();
                }
            });

            reader.on('end', function () {
                log('Reader removed');
                cleanupAndReset();
                currentReader = null;
            });

        } catch (error) {
            log(`Error in reader setup: ${error.message}`, 'ERROR');
            cleanupAndReset();
        }
    });

    pcsc.on('error', function (err) {
        log(`PCSC error: ${err.message}`, 'ERROR');
        isReaderAvailable = false;
        cleanupAndReset();
    });
}

function stop() {
    if (pcsc) {
        pcsc.close();
    }
    cleanupAndReset();
    currentReader = null;
    isReaderAvailable = false;
}

function isNFCAvailable() {
    return isReaderAvailable;
}

module.exports = { start, stop, isNFCAvailable };