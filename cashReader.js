const serialConfig = require('./config/serialConfig');
const sspLib = require('encrypted-smiley-secure-protocol');

class NV200CashMachine {
    constructor(port = 'COM8', baudRate = 9600, debug = false) {
        this.eSSP = new sspLib({
            id: 0x00,       // Device ID (default 0)
            fixedKey: '0123456701234567', // Encryption key
            timeout: 3000,  // Command response timeout
            debug, 
            encryptAllCommand: false         // Enable debug logs
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
            //await this.eSSP.initEncryption();
            console.log('Encryption initialized.');
        } catch (error) {
            console.error('Initialization error:', error);
            throw error;
        }
    }

    async enableDevice() {
        try {
            const enableResult = await this.eSSP.command('ENABLE');
            console.log('Enable result:', enableResult);
        } catch (error) {
            console.error('Enable error:', error);
            throw error;
        }
    }

    async getSerialNumber() {
        try {
            const result = await this.eSSP.command('GET_SERIAL_NUMBER');
            console.log('NV200 Serial number:', result.info.serial_number);
            return result.info.serial_number;
        } catch (error) {
            console.error('Failed to get serial number:', error);
            throw error;
        }
    }

    async pollDevice() {
        try {
            const pollResult = await this.eSSP.command('POLL');
            console.log('Polling result:', pollResult);
            
            if (pollResult.info) {
                if (Array.isArray(pollResult.info)) {
                    if (pollResult.info.some(info => info.name === 'DISABLED')) {
                        console.log('Device is disabled. Attempting to enable...');
                        await this.enableDevice();
                    }
                } else if (typeof pollResult.info === 'object') {
                    // If info is an object, check if it has a 'name' property
                    if (pollResult.info.name === 'DISABLED') {
                        console.log('Device is disabled. Attempting to enable...');
                        await this.enableDevice();
                    }
                } else {
                    console.log('Unexpected info structure:', pollResult.info);
                }
            } else {
                console.log('No info in poll result');
            }
            
            return pollResult;
        } catch (error) {
            console.error('Polling error:', error);
            throw error;
        }
    }

    async payout(amount) {
        try {
            const payoutResult = await this.eSSP.command('PAYOUT_AMOUNT', { amount });
            console.log(`Payout result: ${payoutResult}`);
            return payoutResult;
        } catch (error) {
            console.error('Payout error:', error);
            throw error;
        }
    }

    async emptyCashbox() {
        try {
            const emptyResult = await this.eSSP.command('EMPTY_ALL');
            console.log('Cashbox emptied:', emptyResult);
            return emptyResult;
        } catch (error) {
            console.error('Empty cashbox error:', error);
            throw error;
        }
    }

    async start() {
        await this.initialize();
        await this.enableDevice();  // Attempt to enable the device after initialization
        this.pollInterval = setInterval(async () => {
            try {
                await this.pollDevice();
            } catch (error) {
                console.error('Error during polling:', error);
            }
        }, 1000); // Poll device every second
    }

    async stop() {
        clearInterval(this.pollInterval);
        try {
            await this.eSSP.close();
            console.log('NV200 stopped.');
        } catch (error) {
            console.error('Error stopping NV200:', error);
        }
    }
}

// Export the start function
module.exports = {
    start: async function() {
        const nv200 = new NV200CashMachine(serialConfig.port, serialConfig.baudRate, true);
        try {
            await nv200.start();
            return nv200;
        } catch (error) {
            console.error('Failed to start NV200:', error);
            throw error;
        }
    }
};