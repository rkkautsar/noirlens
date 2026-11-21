import { DeviceMotion } from 'expo-sensors';

import type { MotionSample } from '@/scanner/machine';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export interface MotionSampler {
  stop: () => void;
}

/**
 * Samples CoreMotion through expo-sensors at 20 Hz. Pitch is derived from the
 * gravity vector rather than Euler angles so it stays meaningful regardless of
 * the attitude reference frame. A light low-pass separates gravity from the
 * acceleration of the lift itself.
 */
export async function startMotionSampler(
  onSample: (sample: MotionSample) => void,
): Promise<MotionSampler | null> {
  const available = await DeviceMotion.isAvailableAsync();
  if (!available) {
    return null;
  }

  try {
    await DeviceMotion.requestPermissionsAsync();
  } catch {
    // CoreMotion has no iOS runtime prompt; a denial surfaces as unavailable.
  }

  await DeviceMotion.setUpdateInterval(50);

  let gravityX = 0;
  let gravityY = 0;
  let gravityZ = 0;
  let initialized = false;
  let lastPitch: number | null = null;
  let lastSensorTime: number | null = null;

  const subscription = DeviceMotion.addListener((measurement) => {
    const gravity = measurement.accelerationIncludingGravity;

    if (!initialized) {
      gravityX = gravity.x;
      gravityY = gravity.y;
      gravityZ = gravity.z;
      initialized = true;
    } else {
      gravityX = gravityX * 0.75 + gravity.x * 0.25;
      gravityY = gravityY * 0.75 + gravity.y * 0.25;
      gravityZ = gravityZ * 0.75 + gravity.z * 0.25;
    }

    const magnitude = Math.hypot(gravityX, gravityY, gravityZ);
    if (magnitude < 1) {
      return;
    }

    // 0 deg = flat on a table, +90 deg = upright facing the user.
    const pitch = Math.atan2(-gravityY, Math.hypot(gravityX, gravityZ)) * RAD_TO_DEG;
    const sensorTime = measurement.rotation.timestamp;

    let pitchRate = 0;
    if (
      lastPitch !== null &&
      lastSensorTime !== null &&
      sensorTime > lastSensorTime
    ) {
      pitchRate = (pitch - lastPitch) / (sensorTime - lastSensorTime);
    }

    lastPitch = pitch;
    lastSensorTime = sensorTime;

    const rotationRate = measurement.rotationRate;
    const angularDegPerSec = rotationRate
      ? Math.hypot(rotationRate.alpha, rotationRate.beta, rotationRate.gamma)
      : 0;

    onSample({
      timestampMs: Date.now(),
      pitchDeg: pitch,
      pitchRateDegSec: pitchRate,
      angularSpeedRadSec: angularDegPerSec * DEG_TO_RAD,
    });
  });

  return {
    stop: () => {
      subscription.remove();
    },
  };
}
