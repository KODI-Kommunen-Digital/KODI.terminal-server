// nfcReader.js
const pcsclite = require('pcsclite');
const { sendWebhook } = require('../webhook');
const fs = require('fs');

// Load configuration
const pcsc = pcsclite();

function start() {
    pcsc.on('reader', function(reader) {
        console.log('Reader detected:', reader.name);

        reader.on('error', function(err) {
            console.log('Reader error:', err.message);
        });

        reader.on('status', function(status) {
            const changes = this.state ^ status.state;
            if (changes) {
                if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
                    console.log('Card inserted');
                    reader.connect({ share_mode: this.SCARD_SHARE_SHARED }, function(err, protocol) {
                        if (err) {
                            console.error('Connection error:', err);
                            return;
                        }
                        
                        // Get UID command
                        const getUIDCommand = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]);
                        reader.transmit(getUIDCommand, 40, protocol, function(err, data) {
                            if (err) {
                                console.error('Error getting UID:', err);
                            } else {
                                const uid = data.toString('hex');
                                console.log('Card UID:', uid);
                                
                                // Read data from block 4
                                const readDataCommand = Buffer.from([0xFF, 0xB0, 0x00, 0x04, 0x10]);
                                reader.transmit(readDataCommand, 40, protocol, function(err, data) {
                                    if (err) {
                                        console.error('Error reading data:', err);
                                    } else {
                                        const blockData = data.toString('hex');
                                        console.log('Data from card (Block 4):', blockData);
                                        
                                        // Send Webhook notification
                                        sendWebhook({ uid, blockData }, 'nfc')
                                            .then(() => console.log('Webhook sent successfully'))
                                            .catch(error => console.error('Error sending Webhook:', error));
                                    }
                                    
                                    // Disconnect after reading
                                    reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
                                        if (err) {
                                            console.error('Error disconnecting:', err);
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
            console.log('Reader removed');
        });
    });

    pcsc.on('error', function(err) {
        console.error('PCSC error:', err.message);
    });
}

module.exports = { start };
