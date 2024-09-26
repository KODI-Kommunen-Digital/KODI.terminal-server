const EventEmitter = require('events');
const serialConfig = require('./config/serialConfig');
const sspLib = require('encrypted-smiley-secure-protocol');

class NV200CashMachine extends EventEmitter {
    constructor(port = 'COM8', baudRate = 9600, debug = false) {
        super();
        this.eSSP = new sspLib({
            id: 0x00,
            fixedKey: '0123456701234567',
            timeout: 3000,
            debug,
            encryptAllCommand: false
        });
        this.portOptions = { baudRate };
        this.port = port;
        this.euroDenominations = {
            1: '5 EUR',
            2: '10 EUR',
            3: '20 EUR',
            4: '50 EUR',
            5: '100 EUR',
            6: '200 EUR',
            7: '500 EUR'
        };
        this.currentNote = null;
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
                    pollResult.info.forEach(info => this.handlePollInfo(info));
                } else if (typeof pollResult.info === 'object') {
                    this.handlePollInfo(pollResult.info);
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

    handlePollInfo(info) {
        console.log('Handling info:', info.name);
        switch (info.name) {
            // Slave Reset Events
            case 'SLAVE_RESET':
                console.log('The device has reset itself.');
                this.emit('deviceReset');
                break;

            // Disabled Events
            case 'DISABLED':
                console.log('Device is disabled. Attempting to enable...');
                this.enableDevice();
                break;

            // Note Events
            case 'READ_NOTE':
                this.currentNote = info.channel;
                console.log(`Note being read: Channel ${this.currentNote}`);
                break;
            case 'CREDIT_NOTE':
                const denomination = this.euroDenominations[info.channel] || 'Unknown';
                console.log(`Bill inserted and credited: ${denomination}`);
                this.emit('billInserted', { denomination, channel: info.channel });
                this.currentNote = null;
                break;
            case 'NOTE_REJECTING':
                console.log('Note is being rejected');
                break;
            case 'NOTE_REJECTED':
                console.log('Note has been rejected');
                this.emit('noteRejected');
                break;
            case 'NOTE_STACKING':
                console.log('Note is being stacked');
                break;
            case 'NOTE_STACKED':
                console.log('Note has been stacked');
                break;

            // Fraud Events
            case 'FRAUD_ATTEMPT':
                console.log('Fraud attempt detected');
                this.emit('fraudAttempt');
                break;
            case 'STACKER_FULL':
                console.log('Stacker is full');
                this.emit('stackerFull');
                break;

            // Cash Box Events
            case 'CASH_BOX_REMOVED':
                console.log('Cash box has been removed');
                this.emit('cashBoxRemoved');
                break;
            case 'CASH_BOX_REPLACED':
                console.log('Cash box has been replaced');
                this.emit('cashBoxReplaced');
                break;

            // Payout Events
            case 'NOTE_STORED_IN_PAYOUT':
                console.log('Note stored in payout device');
                break;
            case 'NOTE_DISPENSING':
                console.log('Note is being dispensed');
                break;
            case 'NOTE_DISPENSED':
                console.log('Note has been dispensed');
                this.emit('noteDispensed');
                break;
            case 'NOTE_TRANSFERRED_TO_STACKER':
                console.log('Note transferred to stacker');
                break;

            // Smart Payout Events
            case 'SMART_EMPTYING':
                console.log('Smart emptying in progress');
                break;
            case 'SMART_EMPTIED':
                console.log('Smart emptying completed');
                this.emit('smartEmptied');
                break;

            // Channel Events
            case 'CHANNEL_DISABLE':
                console.log(`Channel ${info.channel} disabled`);
                break;
            case 'CHANNEL_ENABLE':
                console.log(`Channel ${info.channel} enabled`);
                break;
            case 'INITIALISING':
                console.log('Device is initializing');
                break;

            // Coin Mechanism Events (if applicable)
            case 'COIN_MECH_ERROR':
                console.log('Coin mechanism error');
                this.emit('coinMechError');
                break;
            case 'COIN_MECH_JAM':
                console.log('Coin mechanism jam');
                this.emit('coinMechJam');
                break;

            // Barcode Events (if applicable)
            case 'BARCODE_TICKET_VALIDATED':
                console.log('Barcode ticket validated');
                this.emit('barcodeValidated', info.data);
                break;
            case 'BARCODE_TICKET_ACKNOWLEDGE':
                console.log('Barcode ticket acknowledged');
                break;

            // Generic Events
            case 'SAFE_JAM':
                console.log('Safe jam detected');
                this.emit('safeJam');
                break;
            case 'UNSAFE_JAM':
                console.log('Unsafe jam detected');
                this.emit('unsafeJam');
                break;
            case 'ERROR':
                console.log('Generic error occurred');
                this.emit('error', info.data);
                break;

            default:
                console.log(`Unhandled info: ${info.name}`);
                this.emit('unknownEvent', info);
        }
    }
    
        // ... (rest of the class remains the same)
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