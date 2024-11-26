const pcsclite = require('pcsclite');
const { sendWebhook } = require('../webhook');
const fs = require('fs');
const path = require('path');

let pcsc;
let isReaderAvailable = false;
let isProcessingCard = false;

const Logger = require('../utils/logger');

function disconnectCard(reader, reason, logger) {
    reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
        if (err) {
            logger.log(`Error disconnecting card (${reason}): ${err.message}`, 'ERROR');
        } else {
            logger.log(`Card disconnected (${reason})`);
        }
    });
    isProcessingCard = false;
}

function restartReaderConnection(reader, logger) {
    logger.log('Restarting connection to the smart card reader...', 'INFO');
    reader.disconnect(reader.SCARD_UNPOWER_CARD, function (err) {
        if (err) {
            logger.log(`Error during reader restart: ${err.message}`, 'ERROR');
            return;
        }
        logger.log('Reader successfully disconnected. Attempting to reconnect...', 'INFO');

        // Attempt to reconnect the reader
        reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, function (err, protocol) {
            if (err) {
                logger.log(`Error reconnecting to the reader: ${err.message}`, 'ERROR');
                return;
            }
            if (!protocol) {
                logger.log('Protocol still undefined after reconnect attempt', 'ERROR');
                return;
            }
            logger.log('Reader reconnected successfully with a valid protocol');
        });
    });
}

function start() {
    const logger = new Logger(path.join(__dirname, '..', 'logs', 'nfcReader'));
    try {
        pcsc = pcsclite();
        isReaderAvailable = true;
        logger.log('NFC Reader service started successfully');
    } catch (error) {
        logger.log(`Failed to start NFC Reader service: ${error.message}`, 'ERROR');
        isReaderAvailable = false;
        return;
    }

    pcsc.on('reader', function (reader) {
        try {
            logger.log(`Reader detected: ${reader.name}`);

            reader.on('error', function (err) {
                logger.log(`Reader error: ${err.message}`, 'ERROR');
            });

            reader.on('status', function (status) {
                try {
                    const changes = this.state ^ status.state;

                    if (changes && (changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                        if (isProcessingCard) {
                            logger.log('Card already being processed. Ignoring duplicate scan.', 'WARN');
                            return;
                        }

                        isProcessingCard = true;
                        logger.log('Card inserted');

                        const connectOptions = {
                            share_mode: reader.SCARD_SHARE_SHARED,
                        };

                        reader.connect(connectOptions, function (err, protocol) {
                            if (err) {
                                logger.log(`Connection error: ${err.message}`, 'ERROR');
                                isProcessingCard = false;
                                return;
                            }

                            if (!protocol) {
                                logger.log('Protocol undefined after connect', 'ERROR');
                                disconnectCard(reader, 'protocol undefined', logger);
                                // restartReaderConnection(reader, logger); // Restart the connection
                                return;
                            }


                            try {
                                logger.log(`Connected successfully. Protocol: ${protocol}`);

                                const getUIDCommand = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
                                logger.log(`Sending Get UID command: ${getUIDCommand.toString('hex')}`);

                                reader.transmit(getUIDCommand, 40, protocol, function (err, data) {
                                    if (err) {
                                        logger.log(`Error getting UID: ${err.message}`, 'ERROR');
                                        disconnectCard(reader, 'transmit error', logger);
                                        return;
                                    }

                                    const uid = data.subarray(0, data.length - 2).toString('hex');
                                    const blockData = null;
                                    logger.log(`Scanned card with UID: ${uid}`);

                                    sendWebhook({ uid, blockData }, 'nfc')
                                        .then(() => logger.log('Webhook sent successfully'))
                                        .catch((error) => logger.log(`Error sending Webhook: ${error.message}`, 'ERROR'))
                                        .finally(() => disconnectCard(reader, 'normal processing', logger));
                                });
                            } catch (error) {
                                logger.log(`Unexpected error during connect operation: ${error.message}`, 'ERROR');
                                disconnectCard(reader, 'connect error', logger);
                            }
                        });
                    }
                } catch (error) {
                    logger.log(`Unexpected error handling card status: ${error.message}`, 'ERROR');
                    isProcessingCard = false;
                }
            });

            reader.on('end', function () {
                try {
                    logger.log('Reader removed');
                    disconnectCard(reader, 'reader removal', logger);
                } catch (error) {
                    logger.log(`Error handling reader removal: ${error.message}`, 'ERROR');
                }
            });
        } catch (error) {
            logger.log(`Unexpected error handling reader events: ${error.message}`, 'ERROR');
        }
    });

    pcsc.on('error', function (err) {
        try {
            logger.log(`PCSC error: ${err.message}`, 'ERROR');
            isReaderAvailable = false;
            logger.log('NFC functionality will be disabled', 'WARN');
        } catch (error) {
            console.error('Unexpected error handling PCSC error:', error);
        }
    });
}

function isNFCAvailable() {
    return isReaderAvailable;
}

module.exports = { start, isNFCAvailable };
