import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { HomebridgeWizHelper } from './platform';

import buffer from 'buffer';

import udp from 'dgram';


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

  public callbackFn?: (data: any) => void;

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
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

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


    // /**
    //  * Creating multiple services of the same type.
    //  *
    //  * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    //  * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    //  * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
    //  *
    //  * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
    //  * can use the same sub type id.)
    //  */
    //
    // // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');
    //
    // const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');
    //
    // /**
    //  * Updating characteristics values asynchronously.
    //  *
    //  * Example showing how to update the state of a Characteristic asynchronously instead
    //  * of using the `on('get')` handlers.
    //  * Here we change update the motion sensor trigger states on and off every 10 seconds
    //  * the `updateCharacteristic` method.
    //  *
    //  */
    // let motionDetected = false;
    // setInterval(() => {
    //   // EXAMPLE - inverse the trigger
    //   motionDetected = !motionDetected;
    //
    //   // push the new value to HomeKit
    //   motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
    //   motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);
    //
    //   this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
    //   this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
    // }, 10000);


  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    this.platform.log.debug('Set Characteristic On ->', value);


    this.request('setPilot', { state : value }, (response) => {
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

    this.request('getPilot', {}, (response) => {
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

    this.request('setPilot', { dimming: this.currentState.Brightness }, (response) => {
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

    this.request('getPilot', {}, (response) => {
      this.currentState.Brightness = response.result.dimming;


      // you must call the callback function
      // the first argument should be null if there were no errors
      // the second argument should be the value to return
      callback(null, response.result.dimming);
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

    this.request('setPilot', { temp: this.tempToCalvin(this.currentState.Temperature) }, (response) => {
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

    this.request('getPilot', {}, (response) => {
      this.currentState.Temperature = this.calvinToTemp(parseInt(response.result.temp));


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
    const current = temp - 140;
    const p = 1 - (current / total);
    return Math.round(2700 + ((6500 - 2700) * p));
  }

  calvinToTemp(calvin) {
    const total = 6500 - 2700;
    const current = calvin - 2700;
    const p = current / total;
    return Math.round(140 + ((500 - 140) * p));
  }

  request(method, params, callback) {

    const client = udp.createSocket('udp4');

    //'{"method":"setPilot","params":{"state":true}}'
    const bufferData = Buffer.from(JSON.stringify({
      method,
      params,
    }));

    const ip = this.accessory.context.device.ip;


    client.on('message', (message, remote) => {
      this.platform.log.debug('Retrieved from bulb ', JSON.parse(message.toString()));

      callback(JSON.parse(message.toString()));
      setTimeout(() => client.close(), 0);
    });

    client.send(bufferData, 38899, ip, (error) => {
      // client.close();
      if (error) {
        client.close();
        throw error;
      }
    });
  }
}
