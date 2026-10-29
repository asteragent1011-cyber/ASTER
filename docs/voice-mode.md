# ASTER voice mode

ASTER voice mode uses the existing chat, agent, SSE, and text-to-speech pipelines.

## Flow

1. The existing composer microphone button starts voice mode.
2. macOS uses the existing Electron speech bridge and native speech helper.
3. Supported browsers use `SpeechRecognition`/`webkitSpeechRecognition`; the browser owns microphone permission.
4. Final recognition text dispatches the same `type: "send"` action used by normal chat, preserving the selected bot and thread.
5. The store observes the existing settled assistant `message` SSE frame.
6. The existing `speaker` singleton speaks that user-facing reply and resumes listening after playback or interruption.

Voice mode is direct-chat only. Group calls and the existing native call screen are unchanged.

## Platform limitations

Browser speech recognition is not available in every browser and generally requires a secure origin. When unsupported, the microphone control is not offered. Microphone permission denial and recognition failures are shown as composer errors. macOS continues to use on-device recognition through the existing bridge.

No voice or AI credentials are added to the frontend.
