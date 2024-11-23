const pcsclite = require('pcsclite');
const { sendWebhook } = require('../webhook');
const fs = require('fs');
const path = require('path');

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
                        if (isProcessingCard) {
                            log('Card already being processed. Ignoring duplicate scan.', 'WARN');
                            return;
                        }

                        isProcessingCard = true;
                        log('Card inserted');

                        const connectOptions = {
                            share_mode: reader.SCARD_SHARE_SHARED,
                        };

                        reader.connect(connectOptions, function (err, protocol) {
                            if (err) {
                                log(`Connection error: ${err.message}`, 'ERROR');
                                isProcessingCard = false;
                                return;
                            }

                            try {
                                log(`Connected successfully. Protocol: ${protocol}`);

                                // Send Get UID command
                                const getUIDCommand = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
                                log(`Sending Get UID command: ${getUIDCommand.toString('hex')}`);

                                reader.transmit(getUIDCommand, 40, protocol, function (err, data) {
                                    if (err) {
                                        log(`Error getting UID: ${err.message}`, 'ERROR');
                                        isProcessingCard = false;
                                        return;
                                    }

                                    const uid = data.subarray(0, data.length - 2).toString('hex');
                                    const blockData = null; // Add logic to retrieve block data if necessary

                                    sendWebhook({ uid, blockData }, 'nfc')
                                        .then(() => log('Webhook sent successfully'))
                                        .catch((error) => log(`Error sending Webhook: ${error.message}`, 'ERROR'))
                                        .finally(() => {
                                            isProcessingCard = false;
                                        });
                                });
                            } catch (error) {
                                log(`Unexpected error during connect operation: ${error.message}`, 'ERROR');
                                isProcessingCard = false;
                            }
                        });
                    }
                } catch (error) {
                    log(`Unexpected error handling card status: ${error.message}`, 'ERROR');
                    isProcessingCard = false;
                }
            });

            reader.on('end', function () {
                try {
                    log('Reader removed');
                    reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
                        if (err) {
                            log(`Error disconnecting reader: ${err.message}`, 'ERROR');
                        } else {
                            log('Reader disconnected');
                        }
                    });
                } catch (error) {
                    log(`Error handling reader removal: ${error.message}`, 'ERROR');
                }
            });
        } catch (error) {
            log(`Unexpected error handling reader events: ${error.message}`, 'ERROR');
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
