# Whisper Transcription

Transcribe audio to clipboard using local Whisper.cpp

## Prerequisites

Install [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) somewhere on your system. Follow the quickstart section in the README to create the main script and download a model.

Install sox for audio recording: `brew install sox`

## Usage

The app comes with one command: `Transcribe Audio`, which will begin a recording. After you stop the recording (by pressing enter), it will transcribe the audio and paste it to the active input on your computer.

On first run, you will need to provide the path to your local whisper.cpp installation, and modify the model name/sox path if necessary.

## Installing from Git

```
git clone https://github.com/jmilldotdev/raycast-whisper-transcription.git
cd raycast-whisper-transcription
npm i
npm build
```

Then in raycast run `Import Extension` and point to the dist folder that's created.