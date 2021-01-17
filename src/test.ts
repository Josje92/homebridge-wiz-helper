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


export class TestClass {
    constructor() {
        this.discoverDevices();
    }
    discoverDevices() {

        find().then(async (devices: IDevice[]) => {
            const lights: IWizDevice[] = [];

            for (const device of devices) {
                const wizDevice = await this.getWizDevice(device.ip);
                if (wizDevice) {
                    lights.push(wizDevice as IWizDevice);
                }
            }
            console.log('Discovered these lights: ', lights);
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
            }, 500);
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
new TestClass();
