/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Please transcribe this audio accurately. Only return the transcription text." },
            { inlineData: { data: audioBase64, mimeType } }
          ]
        }
      ]
    });
    return response.text || "Transcription failed.";
  } catch (error) {
    console.error("Transcription error:", error);
    return "Error during transcription.";
  }
}
