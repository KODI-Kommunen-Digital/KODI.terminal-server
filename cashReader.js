// NV200 Cash Machine Interface
const serialConfig = require('./config/serialConfig');
const sspLib = require('encrypted-smiley-secure-protocol');

class NV200CashMachine {
    constructor(port = 'COM1', baudRate = 9600, debug = false) {
        this.eSSP = new sspLib({
            id: 0x00,       // Device ID (default 0)
            fixedKey: '0123456701234567', // Encryption key
            timeout: 3000,  // Command response timeout
            debug,          // Enable debug logs
        });
        this.portOptions = { baudRate }; // Serial port settings
        this.port = port;
    }

    async initialize() {
        try {
            // Open the communication port
            await this.eSSP.open(this.port, this.portOptions);
            console.log('NV200 connected on', this.port);
            
            // Initialize encryption (eSSP requirement)
            await this.eSSP.initEncryption();
            console.log('Encryption initialized.');
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    async getSerialNumber() {
        try {
            const result = await this.eSSP.command('GET_SERIAL_NUMBER');
            console.log('NV200 Serial number:', result.info.serial_number);
        } catch (error) {
            console.error('Failed to get serial number:', error);
        }
    }

    async pollDevice() {
        try {
            const pollResult = await this.eSSP.command('POLL');
            console.log('Polling result:', pollResult);
        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    async payout(amount) {
        try {
            const payoutResult = await this.eSSP.command('PAYOUT_AMOUNT', { amount });
            console.log(`Payout result: ${payoutResult}`);
        } catch (error) {
            console.error('Payout error:', error);
        }
    }

    async emptyCashbox() {
        try {
            const emptyResult = await this.eSSP.command('EMPTY_ALL');
            console.log('Cashbox emptied:', emptyResult);
        } catch (error) {
            console.error('Empty cashbox error:', error);
        }
    }

    async start() {
        await this.initialize();
        this.pollInterval = setInterval(async () => {
            await this.pollDevice();
        }, 1000); // Poll device every second
    }

    async stop() {
        clearInterval(this.pollInterval);
        await this.eSSP.close();
        console.log('NV200 stopped.');
    }
}

// Export the start function
module.exports = {
    start: async function() {
        const nv200 = new NV200CashMachine(serialConfig.port, serialConfig.baudRate, true); // Replace COM1 with your serial port if different
        await nv200.start();
        return nv200;
    }
};
