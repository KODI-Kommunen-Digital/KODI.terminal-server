// nv200Reader.js
const SerialPort = require('serialport');
const { sendDiscordWebhook } = require('./webhook');
const { getEnableValidatorCommand, getPollCommand } = require('./config/serialUtils');
const serialConfig = require('./config/serialConfig');

function start() {
    const port = new SerialPort(serialConfig.port, { baudRate: serialConfig.baudRate });

    port.on('open', () => {
        console.log(`Serial Port Opened on ${serialConfig.port} at ${serialConfig.baudRate} baud rate`);

        // Enable the NV200 validator
        const enableCommand = getEnableValidatorCommand();
        sendCommand(port, enableCommand);

        // Poll the NV200 every 2 seconds
        setInterval(() => {
            const pollCommand = getPollCommand();
            sendCommand(port, pollCommand);
        }, 2000);
    });

    port.on('data', (data) => {
        console.log('Data received from NV200:', data.toString('hex'));

        // Send Discord webhook notification with the received data
        const hexData = data.toString('hex');
        sendDiscordWebhook({ data: hexData }, 'nv200')
            .then(() => console.log('Discord webhook sent successfully'))
            .catch(error => console.error('Error sending Discord webhook:', error));
    });

    port.on('error', (err) => {
        console.log('Serial Port Error:', err.message);
    });

    port.on('close', () => {
        console.log('Serial Port Closed');
    });

    port.on('end', () => {
        console.log('Serial Port Disconnected');
    });
}

function sendCommand(port, command) {
    port.write(command, (err) => {
        if (err) {
            return console.error('Error on write:', err.message);
        }
        console.log('Command sent to NV200:', command.toString('hex'));
    });
}

module.exports = { start };
