// Good chunks of this were taked from that one guy's code
let namePrefix = "Pinecil";
let updateInterval = 150; // update interval for polling

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
let last_move = 0;
let is_moving = false;


function requestBluetoothDevice() {
    let services = [BT_UUID_SVC_BULK_DATA, BT_UUID_SVC_SETTINGS_DATA];
    log('Requesting any Bluetooth Device...');
    return navigator.bluetooth.requestDevice({
        filters: [{ 'services': services }, { 'namePrefix': namePrefix }],
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
                .then(function (server) {
                    server.getPrimaryService(BT_UUID_SVC_SETTINGS_DATA)
                        .then(function (service) {
                            service.getCharacteristic(BT_UUID_CHAR_BLE_SETTINGS_VALUE_SAVE)
                                .then(function (c) {
                                    console.log('value save', c);
                                    cc[BT_UUID_SVC_SETTINGS_DATA + c.uuid] = c
                                })

                            return service.getCharacteristic(BT_UUID_CHAR_BLE_SETTINGS_VALUE_SETPOINT);
                        })
                        .then(function (c) {
                            console.log('setting', c);
                            cc[BT_UUID_SVC_SETTINGS_DATA + c.uuid] = c
                        })
                        .catch(function (error) {
                            log(error);
                        });

                    return server.getPrimaryService(BT_UUID_SVC_BULK_DATA);
                })
                .then(function (service) {
                    return service.getCharacteristic(BT_UUID_CHAR_BLE_BULK_LIVE_DATA);
                })
                .then(function (c) {
                    console.log('bulk', c);
                    cc[BT_UUID_SVC_BULK_DATA + c.uuid] = c
                    console.log('All good.');
                    connected = true;
                })
                .catch(function (error) {
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
            backoffTimeoutID = setTimeout(function () {
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
                // each item in the struct has 4 bytes (32 bits)
                const uptime = value.getUint32(28, true); // Index 7 * 4 bytes
                last_move = value.getUint32(32, true);    // Index 8 * 4 bytes

                temp = value.getUint32(0, true);
                spt = value.getUint32(4, true);
                handle = value.getUint32(12, true) / 10;
                watt = Math.round(value.getUint32(52, true) / 10);
                max_watt = Math.max(max_watt, watt);

                // Calculate time since last movement
                const timeSinceMove = uptime - last_move;
                last_move = timeSinceMove;
            })
            .catch(function (error) {
                console.log(error);
            });

        if (last_move !== undefined) {
            console.log(`Last movement: ${last_move} deciseconds ago`);
        }
    }
}

setInterval(poll, updateInterval);
setInterval(updateCountdown, updateInterval);


document.addEventListener('DOMContentLoaded', function () {
    if (!init()) {
        alert('Web Bluetooth API not available. Please use a Chromium based browser');
    }
    else {
        document.getElementById('connect').addEventListener('click', function () {
            requestBluetoothDevice();
        });
    }

    setInterval(function () {
        if (connected) {
            document.getElementById('currentTemp').textContent = temp;
            document.getElementById('power').textContent = watt;
            document.getElementById('maxPower').textContent = max_watt;
            document.getElementById('lastMove').textContent = last_move;
        }
    }, updateInterval);

    // Try autoconnect if available
    if (autoconnect) {
        populateBluetoothDevices(true);
    }
});

// Countdown functionality
const MAX_COUNTDOWN = 100;
let countdown = MAX_COUNTDOWN;

function updateCountdown() {
    if (!connected) return;

    if (last_move < 5) {
        countdown = Math.min(MAX_COUNTDOWN, countdown + 5);
    } else {
        countdown = Math.max(0, countdown - 1);
    }

    const countdownElement = document.getElementById('timer');
    if (countdownElement) {
        countdownElement.textContent = countdown;
    }
}
