export interface AudioDeviceLike {
  kind: string;
  deviceId: string;
  label: string;
}

export function isLikelyLoopbackLabel(label: string): boolean {
  return /\b(monitor|loopback|what\s*u\s*hear|stereo mix|wave out)\b/i.test(label);
}

export interface AudioInputSituation {
  pickedId: string | undefined;
  inputCount: number;
  usableCount: number;
  onlyLoopback: boolean;
  noInputs: boolean;
}

/**
 * Prefer a real hardware mic over Chromium's "default"/"communications"
 * aliases when those resolve to a PulseAudio/PipeWire monitor source.
 */
export function pickAudioInputId(devices: AudioDeviceLike[]): string | undefined {
  return audioInputSituation(devices).pickedId;
}

function isAliasId(deviceId: string): boolean {
  return deviceId === "default" || deviceId === "communications";
}

function isAliasLabel(label: string): boolean {
  return !label || /^default\b/i.test(label) || /^communications\b/i.test(label);
}

export function audioInputSituation(devices: AudioDeviceLike[]): AudioInputSituation {
  const inputs = devices.filter((device) => device.kind === "audioinput" && device.deviceId);
  const usable = inputs.filter((device) => !isLikelyLoopbackLabel(device.label));
  const namedLoopback = inputs.filter(
    (device) =>
      isLikelyLoopbackLabel(device.label) && !isAliasId(device.deviceId) && !isAliasLabel(device.label),
  );
  const namedUsable = usable.filter(
    (device) => !isAliasId(device.deviceId) && !isAliasLabel(device.label),
  );
  const pool = usable.length > 0 ? usable : inputs;
  const named = pool.find(
    (device) => !isAliasId(device.deviceId) && Boolean(device.label) && !isAliasLabel(device.label),
  );
  return {
    pickedId: named?.deviceId ?? pool[0]?.deviceId,
    inputCount: inputs.length,
    usableCount: usable.length,
    onlyLoopback: namedUsable.length === 0 && namedLoopback.length > 0,
    noInputs: inputs.length === 0,
  };
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
