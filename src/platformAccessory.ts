import {
    Service,
    PlatformAccessory,
    CharacteristicValue,
    CharacteristicSetCallback,
    CharacteristicGetCallback
} from 'homebridge';

import { HomebridgeWizHelper } from './platform';

import udp, { Socket } from 'dgram';

const requests: {[ key: string]: any} = {};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class HomebridgeWizLight {
    private service: Service;

    /**
     * The currentstate object
     */
    private currentState = {
        On: false,
        Brightness: 100,
        Temperature: 140,
    };

    private pendingRequest = false;
    private callbacks: any = [];

    constructor(
        private readonly platform: HomebridgeWizHelper,
        private readonly accessory: PlatformAccessory,
    ) {

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'WiZ')
            .setCharacteristic(this.platform.Characteristic.Model, 'ESP14_SHTW1C_01');
        // .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

        // get the LightBulb service if it exists, otherwise create a new LightBulb service
        // you can create multiple services for each accessory
        this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.mac);

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/Lightbulb

        // register handlers for the On/Off Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .on('set', this.setOn.bind(this))                // SET - bind to the `setOn` method below
            .on('get', this.getOn.bind(this));               // GET - bind to the `getOn` method below

        // register handlers for the Brightness Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.Brightness)
            .on('set', this.setBrightness.bind(this))                // SET - bind to the `setOn` method below
            .on('get', this.getBrightness.bind(this));       // SET - bind to the 'setBrightness` method below

        // register handlers for the Brightness Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
            .on('set', this.setTemperature.bind(this))                // SET - bind to the `setOn` method below
            .on('get', this.getTemperature.bind(this));       // SET - bind to the 'setBrightness` method below

    }

    /**
     * Handle "SET" requests from HomeKit
     * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
     */
    setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {

        this.platform.log.debug('Set Characteristic On ->', value);


        this.request('setPilot', {state: value}, () => {
            this.currentState.On = value as boolean;
            callback(null);
        });
    }

    /**
     * Handle the "GET" requests from HomeKit
     * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
     *
     * GET requests should return as fast as possbile. A long delay here will result in
     * HomeKit being unresponsive and a bad user experience in general.
     *
     * If your device takes time to respond you should update the status of your device
     * asynchronously instead using the `updateCharacteristic` method instead.

     * @example
     * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
     */
    getOn(callback: CharacteristicGetCallback) {

        // implement your own code to check if the device is on
        const isOn = this.currentState.On;

        this.platform.log.debug('Get Characteristic On ->', isOn);

        this.getPilot((response) => {
            this.currentState.On = response.result.state;


            // you must call the callback function
            // the first argument should be null if there were no errors
            // the second argument should be the value to return
            callback(null, response.result.state);
        });
    }

    /**
     * Handle "SET" requests from HomeKit
     * These are sent when the user changes the state of an accessory, for example, changing the Brightness
     */
    setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {

        // implement your own code to set the brightness
        this.currentState.Brightness = value as number;

        this.platform.log.debug('Set Characteristic Brightness -> ', value);

        this.request('setPilot', {dimming: this.currentState.Brightness}, () => {
            // you must call the callback function
            callback(null);
        });
    }

    /**
     * Handle "SET" requests from HomeKit
     * These are sent when the user changes the state of an accessory, for example, changing the Brightness
     */
    getBrightness(callback: CharacteristicGetCallback) {

        // implement your own code to set the brightness
        const value = this.currentState.Brightness;

        this.platform.log.debug('Get Characteristic Brightness -> ', value);

        this.getPilot((response) => {
            const result = response.result.dimming ?? 0;
            this.currentState.Brightness = result;


            // you must call the callback function
            // the first argument should be null if there were no errors
            // the second argument should be the value to return
            callback(null, result);
        });
    }

    /**
     * Handle "SET" requests from HomeKit
     * These are sent when the user changes the state of an accessory, for example, changing the Temperature
     */
    setTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback) {

        // implement your own code to set the temperature
        this.currentState.Temperature = value as number;

        this.platform.log.debug('Set Characteristic Temperature -> ', value);

        this.request('setPilot', {temp: this.tempToCalvin(this.currentState.Temperature)}, () => {
            // you must call the callback function
            callback(null);
        });
    }

    /**
     * Handle "SET" requests from HomeKit
     * These are sent when the user changes the state of an accessory, for example, changing the Temperature
     */
    getTemperature(callback: CharacteristicGetCallback) {

        // implement your own code to set the temperature
        const value = this.currentState.Temperature;

        this.platform.log.debug('Get Characteristic Temperature -> ', value);

        this.getPilot((response) => {
            let temp = this.calvinToTemp(parseInt(response.result.temp));
            if (isNaN(temp)) {
                temp = 500;
            }
            this.currentState.Temperature = temp;


            // you must call the callback function
            // the first argument should be null if there were no errors
            // the second argument should be the value to return
            callback(null, this.currentState.Temperature);
        });
    }

    // Calvin = 2700, 6500
    // Temp   =  140, 500
    tempToCalvin(temp) {
        const total = 500 - 140;
        // A)   current = 500 - 140 = 360
        const current = temp - 140;
        // A)   p = 1 - (360 / 360) = 0
        const p = 1 - (current / total);
        // A)   return Math.round(2700 + ((6500 - 2700) * 0)) = 2700;
        return Math.round(2700 + ((6500 - 2700) * p));
    }

    calvinToTemp(calvin) {
        const total = 6500 - 2700;
        // A)   current = 2700 - 2700 = 0
        const current = calvin - 2700;
        // A)   p = 1 - (0 / 3800) = 1
        const p = 1 - (current / total);
        // A)   return Math.round(140 + ((500 - 140) * 1)) = 500
        return Math.round(140 + ((500 - 140) * p));
    }

    getPilot(callback) {
        this.callbacks.push(callback);
        if (!this.pendingRequest) {
            this.request('getPilot', {});
        }
    }

    request(method, params, callback?: (data: any) => void) {

        this.pendingRequest = true;
        const client = udp.createSocket('udp4');

        const json = JSON.stringify({
            method,
            params,
        });
        //'{"method":"setPilot","params":{"state":true}}'
        const bufferData = Buffer.from(json);

        const ip = this.accessory.context.device.ip;
        const mac = this.accessory.context.device.mac;


        client.on('message', (message) => {
            this.pendingRequest = false;
            this.platform.log.debug('Retrieved from bulb ', JSON.parse(message.toString()));

            if (callback) {
                callback(JSON.parse(message.toString()));
            } else {
                this.callbacks.forEach((callback) => {
                    callback(JSON.parse(message.toString()));
                });
                this.callbacks = [];
            }


            setTimeout(() => client.close(), 0);
        });

        this.platform.log.debug(`Sending ip: ${ip} // Sending mac: ${mac}`);

        client.send(bufferData, 38899, ip, (error) => {
            this.pendingRequest = false;
            if (error) {
                client.close();
                throw error;
            }
        });
    }
}
