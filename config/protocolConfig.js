module.exports = {
    ssp: {
        enableValidator: Buffer.from([0x7F, 0x00, 0x03, 0x01, 0x02, 0x06]),
        poll: Buffer.from([0x7F, 0x00, 0x02, 0x07, 0x09]),
        // Add other SSP commands here...
    },
    // Add ccTalk or other protocol configurations here if needed...
};
