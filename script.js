// config
let namePrefix = "Pinecil";
let updateInterval = 1000; // update interval for polling

// vars
let live_temp = 0;
let power_level = 0;
let writingTempTrigger = false;
let writingTempValue = 0;
let connected = false;
let autoconnect = false;
let persistentSettingsTrigger = false;
let backoffTimeoutID;
let populatedDevice;
let cc = new Object();
let log = console.log;

// Values that previously came from UI
let temp = 0;
let spt = 0;
let handle = 0;
let dc = 0;
let watt = 0;
let max_watt = 0;

function init() {
    // defines: https://github.com/Ralim/IronOS/blob/BLE/source/Core/BSP/Pinecilv2/ble_characteristics.h
    // handlers: https://github.com/Ralim/IronOS/blob/BLE/source/Core/BSP/Pinecilv2/ble_handlers.cpp
    // there's no notification services yet so I do polling every 1000ms

    console.log('If something does not work, please read project wiki first: https://github.com/joric/pinecil/wiki');

    if (typeof navigator == 'undefined' || typeof navigator.bluetooth == 'undefined' || typeof navigator.bluetooth.requestDevice == 'undefined' ) {
        return false;
    }

    BT_UUID_SVC_BULK_DATA                        = '9eae1000-9d0d-48c5-aa55-33e27f9bc533'; // bulk service
    BT_UUID_CHAR_BLE_BULK_LIVE_DATA              = '9eae1001-9d0d-48c5-aa55-33e27f9bc533'; // was BluetoothUUID.canonicalUUID(1);

    BT_UUID_SVC_SETTINGS_DATA                    = 'f6d80000-5a10-4eba-aa55-33e27f9bc533'; // settings service
    BT_UUID_CHAR_BLE_SETTINGS_VALUE_SAVE         = 'f6d7ffff-5a10-4eba-aa55-33e27f9bc533'; // was BluetoothUUID.canonicalUUID("0xFFFF"); // write 1 to save settings
    BT_UUID_CHAR_BLE_SETTINGS_VALUE_SETPOINT     = 'f6d70000-5a10-4eba-aa55-33e27f9bc533'; // was BluetoothUUID.canonicalUUID(0); // setpoint temp setting

    autoconnect = typeof navigator.bluetooth.getDevices != 'undefined'

    console.log('Autoconnect support (chrome://flags/#enable-web-bluetooth-new-permissions-backend)', autoconnect ? 'enabled (only works in anonymous mode).':'disabled.');
    return true;
}

function requestBluetoothDevice() {
    let services = [BT_UUID_SVC_BULK_DATA, BT_UUID_SVC_SETTINGS_DATA];
    log('Requesting any Bluetooth Device...');
    return navigator.bluetooth.requestDevice({
         filters: [{'services':services}, {'namePrefix':namePrefix}],
         optionalServices: services,
    })
    .then(device => {
        log('> Requested ' + device.name + ' (' + device.id + ')');
        populateBluetoothDevices();
        bluetoothDevice = device;
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
        return connect();
    })
    .catch(error => {
        log('Argh! ' + error);
    });
}

function forgetBluetoothDevice(deviceId) {
    return navigator.bluetooth.getDevices()
    .then(devices => {
        const device = devices.find((device) => device.id == deviceId);
        if (!device) {
            throw new Error('No Bluetooth device to forget');
        }
        log('Forgetting ' + device.name + 'Bluetooth device...');
        return device.forget();
    })
    .then(() => {
        log('  > Bluetooth device has been forgotten.');
        populateBluetoothDevices();
    })
    .catch(error => {
        log('Argh! ' + error);
    });
}

function populateBluetoothDevices(tryToConnect) {
    if (!autoconnect) {
        return;
    }

    log('Getting existing permitted Bluetooth devices...');
    return navigator.bluetooth.getDevices()
    .then(devices => {
        log('> Got ' + devices.length + ' Bluetooth devices.');
        
        for (const device of devices) {
            if (device.name.startsWith(namePrefix)) {
                populatedDevice = device;
            }
        }

        if (tryToConnect && populatedDevice) {
            bluetoothDevice = populatedDevice;
            console.log('Autoconnecting to', bluetoothDevice);
            bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
            connect();
        }

        return devices;
    })
    .catch(error => {
        log('Argh! ' + error);
    });
}

function connect() {
    return exponentialBackoff(3 /* max retries */, 2 /* seconds delay */,
        function toTry() {
            time('Connecting to Bluetooth Device... ');
            return bluetoothDevice.gatt.connect();
        },
        function success() {
            log('> Bluetooth Device connected.');
            
            bluetoothDevice.gatt.connect()
            .then(function(server) {
                server.getPrimaryService(BT_UUID_SVC_SETTINGS_DATA)
                .then(function(service) {
                     service.getCharacteristic(BT_UUID_CHAR_BLE_SETTINGS_VALUE_SAVE)
                     .then(function(c) {
                            console.log('value save',c);
                            cc[BT_UUID_SVC_SETTINGS_DATA + c.uuid] = c
                        })

                        return service.getCharacteristic(BT_UUID_CHAR_BLE_SETTINGS_VALUE_SETPOINT);
                })
                .then(function(c) {
                        console.log('setting',c);
                        cc[BT_UUID_SVC_SETTINGS_DATA + c.uuid] = c
                })
                .catch(function(error) {
                    log(error);
                });

                return server.getPrimaryService(BT_UUID_SVC_BULK_DATA);
            })
            .then(function(service) {
                return service.getCharacteristic(BT_UUID_CHAR_BLE_BULK_LIVE_DATA);
            })
            .then(function(c) {
                 console.log('bulk',c);
                 cc[BT_UUID_SVC_BULK_DATA + c.uuid] = c
                 console.log('All good.');
                 connected = true;
            })
            .catch(function(error) {
                log(error);
            });
        },
        function fail() {
            time('Failed to reconnect.');
        });
}

function onDisconnected() {
    log('> Bluetooth Device disconnected');
    connected = false;
    connect();
}

function exponentialBackoff(max, delay, toTry, success, fail) {
    clearTimeout(backoffTimeoutID);
    toTry().then(result => success(result))
    .catch(e => {
        if (max === 0) {
            return fail();
        }
        console.log('error on connecting:', e);
        time('Retrying in ' + delay + 's... (' + max + ' tries left)');
        backoffTimeoutID = setTimeout(function() {
            exponentialBackoff(--max, delay * 2, toTry, success, fail);
        }, delay * 1000);
    });
}

function time(text) {
    log('[' + new Date().toJSON().substr(11, 8) + '] ' + text);
}

function writeTempValue(value) {
    if (value >= 50 || value <= 450) {
        writingTempTrigger = true;
        writingTempValue = value;
    }
}

function poll() {
    liveID = BT_UUID_SVC_BULK_DATA + BT_UUID_CHAR_BLE_BULK_LIVE_DATA;

    if (connected && cc[liveID]) {
        cc[liveID].readValue()
        .then(value => {
            /*
            uint32_t bulkData[] = {
                    TipThermoModel::getTipInC(),                                         // 0  - Current temp
                    getSettingValue(SettingsOptions::SolderingTemp),                     // 1  - Setpoint
                    getInputVoltageX10(getSettingValue(SettingsOptions::VoltageDiv), 0), // 2  - Input voltage
                    getHandleTemperature(0),                                             // 3  - Handle X10 Temp in C
                    X10WattsToPWM(x10WattHistory.average()),                             // 4  - Power as PWM level
                    getPowerSrc(),                                                       // 5  - power src
                    getTipResistanceX10(),                                               // 6  - Tip resistance
                    xTaskGetTickCount() / TICKS_100MS,                                   // 7  - uptime in deciseconds
                    lastMovementTime / TICKS_100MS,                                      // 8  - last movement time (deciseconds)
                    TipThermoModel::getTipMaxInC(),                                      // 9  - max temp
                    TipThermoModel::convertTipRawADCTouV(getTipRawTemp(0), true),        // 10 - Raw tip in μV
                    abs(getRawHallEffect()),                                             // 11 - hall sensor
                    currentMode,                                                         // 12 - Operating mode
                    x10WattHistory.average(),                                            // 13 - Estimated Wattage *10
            };
            */
            // each item in the struct has 4 bits
            last_move = value.getUint32(8, true);
            temp = value.getUint32(0, true);
            spt = value.getUint32(4, true); 
            watt = Math.round(value.getUint32(52, true) / 10);
            max_watt = Math.max(max_watt, watt);

            if (writingTempTrigger) {
                writingTempTrigger = false;
                tempID = BT_UUID_SVC_SETTINGS_DATA + BT_UUID_CHAR_BLE_SETTINGS_VALUE_SETPOINT;

                if (connected && cc[tempID]) {
                    value = writingTempValue;
                    let view = new DataView(new ArrayBuffer(2));
                    view.setUint16(0, value, true);

                    cc[tempID].writeValue(view)
                    .then(() => {
                        console.log('WRITE! Setpoint Temp:', value);
                    })
                    .catch(function(error) {
                        console.log('Error writing Setpoint Temp.', error);
                    });
                }
            }

            if (persistentSettingsTrigger) {
                saveID = BT_UUID_SVC_SETTINGS_DATA + BT_UUID_CHAR_BLE_SETTINGS_VALUE_SAVE;
                if (cc[saveID]) {
                    persistentSettingsTrigger = false;
                    let view = new DataView(new ArrayBuffer(2));
                    view.setUint16(0, 1, true);
                    cc[saveID].writeValue(view)
                    .then(value => {
                        console.log('WRITE! Save settings to flash.');
                    })
                    .catch(function(error) {
                        console.log('Error on saving settings.', error);
                    });
                }
            }
        })
        .catch(function(error) {
            console.log(error);
        });
    }
}

function saveSettingsToFlash() {
    if (connected) {
        persistentSettingsTrigger = true;
    }
}

// Start polling when code is loaded
setInterval(poll, updateInterval);

// Initialize when document is loaded
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
}
