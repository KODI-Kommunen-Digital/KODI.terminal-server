// serialUtils.js

// Utility function to get the command to enable the validator
function getEnableValidatorCommand() {
    return Buffer.from([0x7F, 0x00, 0x03, 0x01, 0x02, 0x06]);
}

// Utility function to get the poll command for the NV200
function getPollCommand() {
    return Buffer.from([0x7F, 0x00, 0x02, 0x07, 0x09]);
}

module.exports = {
    getEnableValidatorCommand,
    getPollCommand,
};
