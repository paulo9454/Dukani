const DEVICE_ID_KEY = "dukayko_device_id";

export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    if (!globalThis.crypto?.randomUUID) {
      throw new Error("This browser does not support secure device identification.");
    }

    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}
