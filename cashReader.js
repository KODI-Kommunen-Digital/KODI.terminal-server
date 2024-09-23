const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { sendDiscordWebhook } = require('./webhook');
const serialConfig = require('./config/serialConfig');

const SSP_CMD_SYNC = 0x11;
const SSP_CMD_ENABLE = 0x0A;
const SSP_CMD_POLL = 0x07;
const SSP_CMD_CONFIGURE_BEZEL = 0x54;
const SSP_RESP_OK = 0xF0;
const SSP_EVENT_READ = 0xEF;
const SSP_EVENT_CREDIT = 0xEE;

function start() {
    const port = new SerialPort({ path: serialConfig.port, baudRate: serialConfig.baudRate });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    port.on('open', async () => {
        console.log(`Serial Port Opened on ${serialConfig.port} at ${serialConfig.baudRate} baud rate`);
        
        try {
            await sendCommand(port, createCommand(SSP_CMD_SYNC));
            console.log('Sync command sent');
            
            await sendCommand(port, createCommand(SSP_CMD_ENABLE));
            console.log('NV200 enabled');

            await configureBezel(port, 0, 255, 0);
            console.log('Bezel configured to show green light');

            // Start polling
            setInterval(() => {
                sendCommand(port, createCommand(SSP_CMD_POLL))
                    .catch(error => console.error('Error during polling:', error));
            }, 200);
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    });

    parser.on('data', (data) => {
        console.log('Data received from NV200:', data);
        
        const events = parseResponse(data);
        events.forEach(event => {
            if (event.type === 'credited') {
                console.log(`Cash inserted: Channel ${event.channel}`);
                sendDiscordWebhook({ data: `Cash inserted: Channel ${event.channel}` }, 'nv200')
                    .then(() => console.log('Discord webhook sent successfully'))
                    .catch(error => console.error('Error sending Discord webhook:', error));
            }
        });
    });

    port.on('error', (err) => {
        console.error('Serial Port Error:', err.message);
    });
}

function createCommand(command) {
    const packet = [0x00, 0x01, command];
    let crc = 0xFFFF;
    for (let byte of packet) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0x8408;
            } else {
                crc = crc >> 1;
            }
        }
    }
    crc = ~crc;
    return Buffer.from([0x7F, ...packet, crc & 0xFF, (crc >> 8) & 0xFF]);
}

function sendCommand(port, command) {
    return new Promise((resolve, reject) => {
        console.log('TX:', command.toString('hex').toUpperCase().match(/.{1,2}/g).join(' '));
        port.write(command, (err) => {
            if (err) {
                reject(new Error(`Error on write: ${err.message}`));
            } else {
                port.once('data', (response) => {
                    console.log('RX:', response.toString('hex').toUpperCase().match(/.{1,2}/g).join(' '));
                    resolve(response);
                });
            }
        });
    });
}

function configureBezel(port, red, green, blue) {
    const data = [red, green, blue, 1, 0]; // RGB values, non-volatile setting, solid color
    const packet = [0x00, data.length + 1, SSP_CMD_CONFIGURE_BEZEL, ...data];
    let crc = 0xFFFF;
    for (let byte of packet) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0x8408;
            } else {
                crc = crc >> 1;
            }
        }
    }
    crc = ~crc;
    const command = Buffer.from([0x7F, ...packet, crc & 0xFF, (crc >> 8) & 0xFF]);
    return sendCommand(port, command);
}

function parseResponse(data) {
    const response = Buffer.from(data, 'hex');
    const events = [];
    for (let i = 3; i < response.length - 2; i++) {
        switch (response[i]) {
            case SSP_EVENT_READ:
                events.push({ type: 'reading', channel: response[++i] });
                break;
            case SSP_EVENT_CREDIT:
                events.push({ type: 'credited', channel: response[++i] });
                break;
        }
    }
    return events;
}

module.exports = { start };