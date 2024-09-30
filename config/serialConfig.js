require('dotenv').config();

const serialConfig = {
    port: process.env.SERIAL_PORT || 'COM1',
    baudRate: parseInt(process.env.BAUD_RATE, 10) || 9600
};

module.exports = serialConfig;