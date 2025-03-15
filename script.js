// config
let namePrefix = "Pinecil";
let updateInterval = 100; // update interval for polling
const popups = [
    'popup1.png',
    'popup2.png',
    'popup3.png',
    'popup4.png',
    'popup5.png',
    'popup6.png',
    'popup7.png',
];

// vars
const MAX_COUNTDOWN = 100;
let countdown = MAX_COUNTDOWN;
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
let last_move = 0;

function init() {

    if (typeof navigator == 'undefined' || typeof navigator.bluetooth == 'undefined' || typeof navigator.bluetooth.requestDevice == 'undefined') {
        return false;
    }

    BT_UUID_SVC_BULK_DATA = '9eae1000-9d0d-48c5-aa55-33e27f9bc533'; // bulk service
    BT_UUID_CHAR_BLE_BULK_LIVE_DATA = '9eae1001-9d0d-48c5-aa55-33e27f9bc533'; // was BluetoothUUID.canonicalUUID(1);

    BT_UUID_SVC_SETTINGS_DATA = 'f6d80000-5a10-4eba-aa55-33e27f9bc533'; // settings service
    BT_UUID_CHAR_BLE_SETTINGS_VALUE_SAVE = 'f6d7ffff-5a10-4eba-aa55-33e27f9bc533'; // was BluetoothUUID.canonicalUUID("0xFFFF"); // write 1 to save settings
    BT_UUID_CHAR_BLE_SETTINGS_VALUE_SETPOINT = 'f6d70000-5a10-4eba-aa55-33e27f9bc533'; // was BluetoothUUID.canonicalUUID(0); // setpoint temp setting

    autoconnect = typeof navigator.bluetooth.getDevices != 'undefined'

    return true;
}

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
                const uptime = value.getUint32(28, true);
                last_move = value.getUint32(32, true);

                temp = value.getUint32(0, true);
                handle = value.getUint32(12, true) / 10;
                const timeSinceMove = uptime - last_move;
                last_move = timeSinceMove;
            })
            .catch(function (error) {
                console.log(error);
            });
    }
}

setInterval(poll, updateInterval);

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
}

// Initialize UI elements
document.addEventListener('DOMContentLoaded', function () {
    // Initialize Bluetooth 
    if (!init()) {
        console.log('Web Bluetooth API not available. Please use Chrome or Edge on desktop or Android.');
        document.getElementById('connect').disabled = true;
    }

    setInterval(
        function () {
            if (!connected) return;
            if (last_move < 5) {
                countdown = Math.min(MAX_COUNTDOWN, countdown + Math.random() * 0.05);
            } else {
                countdown = Math.max(0, countdown - 0.1);
            }

            const countdownElement = document.getElementById('timer');
            if (countdownElement) {
                if (last_move < 5) {
                    countdownElement.style.left = '0px';
                    countdownElement.style.top = '0px';
                } else {
                    countdownElement.style.position = 'relative';
                    countdownElement.style.left = `${Math.random() * 10 - 5}px`;
                    countdownElement.style.top = `${Math.random() * 10 - 5}px`;

                }
                countdownElement.textContent = countdown.toFixed(1);
            }

            const siteArea = document.getElementById('site');
            if (siteArea) {
                siteArea.style.opacity = countdown / MAX_COUNTDOWN;
            }
        }
        , 10)
    setInterval(tempChange, 1000);

    setInterval(() => {
        showRandomPopup();
    }, 15000);


    // Setup event listeners
    document.getElementById('connect').addEventListener('click', requestBluetoothDevice);

    // Try autoconnect if available
    if (autoconnect) {
        populateBluetoothDevices(true);
    }
});


let initialTemp = temp;
let popupIntervalID;

function showRandomPopup() {
    const randomImage = popups[Math.floor(Math.random() * popups.length)];
    const popup = document.createElement('div');
    popup.id = 'popup';
    popup.style.position = 'fixed';
    popup.style.top = `${Math.random() * 90 - 10}%`;
    popup.style.left = `${Math.random() * 90 - 10}%`;
    popup.style.zIndex = 1000;
    const img = new Image();
    img.src = `./images/${randomImage}`;
    img.onload = () => {
        const scale = 0.5; // Adjust the scale as needed
        popup.style.width = img.width * scale + 'px';
        popup.style.height = img.height * scale + 'px';
    };
    popup.style.backgroundImage = `url('./images/${randomImage}')`;
    popup.style.backgroundSize = 'cover';
    popup.style.border = '5px solid grey';
    document.body.appendChild(popup);
}
function tempChange() {
    if (Math.abs(temp - initialTemp) > 40) {
        const popup = document.getElementById('popup');
        if (popup) {
            popup.remove();
        }
        initialTemp = temp;
    }
}

