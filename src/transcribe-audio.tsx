import { useState, useEffect } from "react";
import {
  Detail,
  showToast,
  Toast,
  Clipboard,
  getPreferenceValues,
  Action,
  ActionPanel,
  closeMainWindow,
  popToRoot,
} from "@raycast/api";
import { spawn, ChildProcess } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { readFile as readFileCallback } from "fs";
import { promisify } from "util";
import { exec } from "child_process";

const readFile = promisify(readFileCallback);

interface Preferences {
  whisperPath: string;
  soxPath: string;
  modelName: string;
}

export default function Command() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [recordingProcess, setRecordingProcess] = useState<ChildProcess | null>(null);

  const preferences = getPreferenceValues<Preferences>();
  const tempAudioFile = join(tmpdir(), "raycast_whisper_audio.wav");

  useEffect(() => {
    const timer = setTimeout(() => {
      startRecording();
    }, 200); // 1 second delay

    return () => {
      clearTimeout(timer);
      if (recordingProcess) recordingProcess.kill();
      cleanupTempFile();
    };
  }, []); // Empty dependency array means this effect runs once on mount

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTranscribing) {
      interval = setInterval(() => {
        setTranscriptionProgress((prev) => (prev + 1) % 4);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isTranscribing]);

  const startRecording = () => {
    setIsRecording(true);

    const process = spawn(preferences.soxPath, ["-d", "-r", "16000", "-b", "16", "-c", "1", tempAudioFile]);
    setRecordingProcess(process);

    process.on("error", (error) => {
      console.error(`Error during recording: ${error}`);
      showToast(Toast.Style.Failure, "Error during recording", error.message);
      setIsRecording(false);
    });

    showToast(Toast.Style.Success, "Recording started", "Click 'Stop Recording' when finished");
  };

  const stopRecordingAndTranscribe = () => {
    if (recordingProcess) {
      recordingProcess.kill();
      setIsRecording(false);
      setIsTranscribing(true); // Set this immediately
      setTimeout(() => {
        if (existsSync(tempAudioFile)) {
          console.log(`Audio file created: ${tempAudioFile}`);
          startTranscription();
        } else {
          console.error(`Audio file not found: ${tempAudioFile}`);
          showToast(Toast.Style.Failure, "Error", "Audio file not created");
          setIsTranscribing(false); // Reset if there's an error
        }
      }, 1000);
    }
  };

  const startTranscription = async () => {
    setTranscriptionProgress(0);
    setIsTranscribing(true);

    if (!existsSync(tempAudioFile)) {
      console.error(`Audio file not found before transcription: ${tempAudioFile}`);
      showToast(Toast.Style.Failure, "Error", "Audio file not found");
      setIsTranscribing(false);
      return;
    }

    const outputTextFile = join(tmpdir(), "whisper_output.txt");
    const command = join(preferences.whisperPath, "main");
    const args = [
      "-m",
      join(preferences.whisperPath, "models", preferences.modelName),
      "-f",
      tempAudioFile,
      "-l",
      "en",
      "--output-txt",
      "-of",
      outputTextFile.replace(".txt", ""),
    ];

    const process = spawn(command, args);

    process.stderr.on("data", (data) => {
      console.error(`Transcription stderr: ${data}`);
    });

    process.on("close", async (code) => {
      setIsTranscribing(false);
      if (code === 0) {
        try {
          let transcribedText = await readFile(outputTextFile, "utf-8");

          // Clean up the transcription
          transcribedText = transcribedText
            .replace(/\[.*?\]/g, "") // Remove anything in square brackets
            .replace(/\n+/g, " ") // Replace line breaks with spaces
            .replace(/\s{2,}/g, " ") // Replace multiple spaces with a single space
            .trim(); // Remove leading/trailing whitespace

          console.log(`Cleaned transcription output: ${transcribedText}`);
          await copyTranscriptionToClipboardAndPaste(transcribedText);
          await unlink(outputTextFile);
          showToast(Toast.Style.Success, "Transcription copied to clipboard");
          await closeMainWindow();
          await popToRoot();
        } catch (error) {
          console.error(`Error reading transcription: ${error}`);
          showToast(Toast.Style.Failure, "Error reading transcription", (error as Error).message);
        }
      } else {
        showToast(Toast.Style.Failure, "Transcription failed", `Exit code: ${code}`);
      }
    });

    process.on("error", (error) => {
      console.error(`Transcription process error: ${error}`);
      showToast(Toast.Style.Failure, "Error during transcription", error.message);
      setIsTranscribing(false);
    });
  };

  const copyTranscriptionToClipboardAndPaste = async (text: string) => {
    if (text.trim()) {
      await Clipboard.copy(text.trim());

      // Execute paste command
      exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`, (error) => {
        if (error) {
          console.error("Error executing paste command:", error);
          showToast(Toast.Style.Failure, "Failed to paste", "Text copied to clipboard but paste failed");
        } else {
          showToast(Toast.Style.Success, "Transcription pasted");
        }
      });
    } else {
      showToast(Toast.Style.Failure, "No transcription to copy");
    }
  };

  const cleanupTempFile = async () => {
    try {
      await unlink(tempAudioFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to delete temporary file:", error);
      }
    }
  };

  const getTranscribingMessage = () => {
    const dots = ".".repeat(transcriptionProgress);
    return `Transcribing${dots}`;
  };

  return (
    <Detail
      markdown={
        isRecording
          ? "Recording in progress... Click 'Stop Recording' or press enter when finished."
          : isTranscribing
            ? getTranscribingMessage()
            : ""
      }
      actions={
        <ActionPanel>
          {isRecording ? (
            <Action title="Stop Recording" onAction={stopRecordingAndTranscribe} />
          ) : !isTranscribing ? (
            <Action title="Start New Recording" onAction={startRecording} />
          ) : null}
        </ActionPanel>
      }
    />
  );
}
