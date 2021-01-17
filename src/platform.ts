import {
    API,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service,
    Characteristic
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { HomebridgeWizLight } from './platformAccessory';
import find, { IDevice } from 'local-devices'
import udp from "dgram";

interface IWizPilotResponse {
    method: string;
    env: string;
    result: {
        mac: string;
        rssi: number;
        src: string;
        state: boolean;
        sceneId?: number;
        temp?: number;
        dimming?: number;
    };
}
interface IWizDevice {
    ip: string;
    type: 'WHITE_LIGHT' | 'RGB_LIGHT' | 'SWITCH';
    mac: string;
    rssi: number;
    src: string;
    state: boolean;
    sceneId?: number;
    temp?: number;
    dimming?: number;
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HomebridgeWizHelper implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform:', this.config.name);

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories
            this.discoverDevices();
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);

        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {

        find().then(async (devices: IDevice[]) => {
            const lights: IWizDevice[] = [];

            for (const device of devices) {
                const wizDevice = await this.getWizDevice(device.ip);
                if (wizDevice) {
                    lights.push(wizDevice as IWizDevice);
                }
            }
            this.log.debug('Discovered these lights: ', lights);

            // loop over the discovered devices and register each one if it has not already been registered
            for (const device of lights) {

                // generate a unique id for the accessory this should be generated from
                // something globally unique, but constant, for example, the device serial
                // number or MAC address
                const uuid = this.api.hap.uuid.generate(device.mac);

                // see if an accessory with the same uuid has already been registered and restored from
                // the cached devices we stored in the `configureAccessory` method above
                const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

                if (existingAccessory) {
                    // the accessory already exists
                    if (device) {
                        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                        // existingAccessory.context.device = device;
                        // this.api.updatePlatformAccessories([existingAccessory]);

                        // create the accessory handler for the restored accessory
                        // this is imported from `platformAccessory.ts`
                        new HomebridgeWizLight(this, existingAccessory);

                        // update accessory cache with any changes to the accessory details and information
                        this.api.updatePlatformAccessories([existingAccessory]);
                    } else if (!device) {
                        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                        // remove platform accessories when no longer present
                        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
                    }
                } else {
                    // the accessory does not yet exist, so we need to create it
                    const displayName = `WiZ ${device.type} ${device.mac}`;
                    this.log.info('Adding new accessory:', displayName);

                    // create a new accessory
                    const accessory = new this.api.platformAccessory(displayName, uuid);

                    // store a copy of the device object in the `accessory.context`
                    // the `context` property can be used to store any data about the accessory you may need
                    accessory.context.device = device;

                    // create the accessory handler for the newly create accessory
                    // this is imported from `platformAccessory.ts`
                    new HomebridgeWizLight(this, accessory);

                    // link the accessory to your platform
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                }
            }
        });
    }

    async getWizDevice(ip: string) {
        return new Promise((resolve) => {
            const client = udp.createSocket('udp4');

            const bufferData = Buffer.from(JSON.stringify({
                method: 'getPilot',
                params: {},
            }));
            client.on('message', (message) => {
                try {
                    const deviceInfo = JSON.parse(message.toString()) as IWizPilotResponse;
                    if (deviceInfo.method === 'getPilot') {
                        resolve(this.makeWizDevice(ip, deviceInfo));
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
                setTimeout(() => client.close(), 0);
            });

            client.send(bufferData, 38899, ip, (error) => {
                if (error) {
                    client.close();
                    resolve(null);
                }
            });

            setTimeout(() => {
                // No result after a second, continue plz
                try {
                    client.close();
                } catch (e) {
                    //
                }
                resolve(null);
            }, 1000);
        });
    }

    makeWizDevice(ip: string, info: IWizPilotResponse): IWizDevice {
        const type = (() => {
            if (!info.result.dimming) {
                return 'SWITCH';
            }
            if (info.result.temp) {
                return 'WHITE_LIGHT';
            }
            return 'RGB_LIGHT';
        })();
        const device: IWizDevice = {
            ip,
            type,
            mac: info.result.mac,
            state: info.result.state,
            rssi: info.result.rssi,
            src: info.result.src,
            sceneId: info.result.sceneId,
        };
        if (type !== 'SWITCH') {
            if (type === 'WHITE_LIGHT') {
                device.dimming = info.result.dimming;
                device.temp = info.result.temp;
            } else {
                // Put RGB stuff here
            }
        }
        return device;
    }
}
