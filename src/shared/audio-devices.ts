export interface AudioDeviceLike {
  kind: string;
  deviceId: string;
  label: string;
}

export function isLikelyLoopbackLabel(label: string): boolean {
  return /\b(monitor|loopback|what\s*u\s*hear|stereo mix|wave out)\b/i.test(label);
}

/**
 * Prefer a real hardware mic over Chromium's "default"/"communications"
 * aliases when those resolve to a PulseAudio/PipeWire monitor source.
 */
export function pickAudioInputId(devices: AudioDeviceLike[]): string | undefined {
  const inputs = devices.filter((device) => device.kind === "audioinput" && device.deviceId);
  const usable = inputs.filter((device) => !isLikelyLoopbackLabel(device.label));
  const pool = usable.length > 0 ? usable : inputs;
  if (pool.length === 0) {
    return undefined;
  }
  const named = pool.find(
    (device) =>
      device.deviceId !== "default" &&
      device.deviceId !== "communications" &&
      Boolean(device.label) &&
      !/^default\b/i.test(device.label),
  );
  return named?.deviceId ?? pool[0]?.deviceId;
}

export function audioTrackConstraints(deviceId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
  if (deviceId && deviceId !== "default" && deviceId !== "communications") {
    constraints.deviceId = { ideal: deviceId };
  }
  return constraints;
}
