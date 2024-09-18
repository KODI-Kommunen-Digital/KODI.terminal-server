const protocolConfig = require('../../config/protocolConfig');

function enableValidator() {
    return protocolConfig.ssp.enableValidator;
}

function poll() {
    return protocolConfig.ssp.poll;
}

module.exports = {
    enableValidator,
    poll,
};
