import {
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

export { useAudioRecorder, useAudioRecorderState, RecordingPresets };

const MAX_RECORDING_DURATION_MS = 60_000; // 60 seconds

/**
 * Request microphone permission. Returns true if granted.
 */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const status = await requestRecordingPermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

/**
 * Check if microphone permission is already granted.
 */
export async function hasMicPermission(): Promise<boolean> {
  try {
    const status = await getRecordingPermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

/**
 * Configure audio mode for recording. Must be called before recording starts.
 */
export async function configureAudioMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  });
}

/**
 * Configure audio mode for playback only (after recording stops).
 */
export async function configurePlaybackMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
  });
}

export { MAX_RECORDING_DURATION_MS };
