/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, Download, Trash2, Play, Pause, RefreshCw, FileText, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import WaveSurfer from 'wavesurfer.js';
import Spectrogram from 'wavesurfer.js/dist/plugins/spectrogram.js';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { processAudio } from './lib/audioUtils';
import { transcribeAudio } from './services/geminiService';
import { LiveSpectrogram } from './components/LiveSpectrogram';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [originalAudio, setOriginalAudio] = useState<Blob | null>(null);
  const [processedAudio, setProcessedAudio] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);
  const [isPlayingProcessed, setIsPlayingProcessed] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [hasLiveResults, setHasLiveResults] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [originalAnalyser, setOriginalAnalyser] = useState<AnalyserNode | null>(null);
  const [processedAnalyser, setProcessedAnalyser] = useState<AnalyserNode | null>(null);
  const liveAudioContext = useRef<AudioContext | null>(null);
  const liveStream = useRef<MediaStream | null>(null);
  const liveSession = useRef<any>(null);

  const originalWaveRef = useRef<HTMLDivElement>(null);
  const processedWaveRef = useRef<HTMLDivElement>(null);
  const originalSpectroRef = useRef<HTMLDivElement>(null);
  const processedSpectroRef = useRef<HTMLDivElement>(null);

  const originalWs = useRef<WaveSurfer | null>(null);
  const processedWs = useRef<WaveSurfer | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // Initialize WaveSurfer for original audio
  useEffect(() => {
    if (originalAudio && originalWaveRef.current) {
      if (originalWs.current) originalWs.current.destroy();
      
      originalWs.current = WaveSurfer.create({
        container: originalWaveRef.current,
        waveColor: '#4f46e5',
        progressColor: '#818cf8',
        cursorColor: '#4f46e5',
        barWidth: 2,
        height: 80,
        plugins: [
          Spectrogram.create({
            container: originalSpectroRef.current!,
            labels: true,
            height: 150,
            splitChannels: false,
          }),
        ],
      });

      const url = URL.createObjectURL(originalAudio);
      originalWs.current.load(url);

      originalWs.current.on('play', () => setIsPlayingOriginal(true));
      originalWs.current.on('pause', () => setIsPlayingOriginal(false));
      originalWs.current.on('finish', () => setIsPlayingOriginal(false));

      return () => {
        URL.revokeObjectURL(url);
        originalWs.current?.destroy();
      };
    }
  }, [originalAudio]);

  // Initialize WaveSurfer for processed audio
  useEffect(() => {
    if (processedAudio && processedWaveRef.current) {
      if (processedWs.current) processedWs.current.destroy();
      
      processedWs.current = WaveSurfer.create({
        container: processedWaveRef.current,
        waveColor: '#10b981',
        progressColor: '#34d399',
        cursorColor: '#10b981',
        barWidth: 2,
        height: 80,
        plugins: [
          Spectrogram.create({
            container: processedSpectroRef.current!,
            labels: true,
            height: 150,
            splitChannels: false,
          }),
        ],
      });

      const url = URL.createObjectURL(processedAudio);
      processedWs.current.load(url);

      processedWs.current.on('play', () => setIsPlayingProcessed(true));
      processedWs.current.on('pause', () => setIsPlayingProcessed(false));
      processedWs.current.on('finish', () => setIsPlayingProcessed(false));

      return () => {
        URL.revokeObjectURL(url);
        processedWs.current?.destroy();
      };
    }
  }, [processedAudio]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        setOriginalAudio(audioBlob);
        handleProcess(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Microphone access denied or not available.');
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setOriginalAudio(file);
      handleProcess(file);
    }
  };

  const handleProcess = async (blob: Blob) => {
    setIsProcessing(true);
    setTranscription('');
    setProcessedAudio(null);
    try {
      // Process audio
      const processed = await processAudio(blob, 8000);
      setProcessedAudio(processed);
      
      // Transcribe
      setIsTranscribing(true);
      const reader = new FileReader();
      reader.readAsDataURL(processed);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const text = await transcribeAudio(base64, 'audio/wav');
        setTranscription(text);
        setIsTranscribing(false);
      };
    } catch (err) {
      setError('Failed to process audio.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadProcessed = () => {
    if (processedAudio) {
      const url = URL.createObjectURL(processedAudio);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cleaned_audio_8khz.wav';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const downloadTranscription = () => {
    if (transcription) {
      const blob = new Blob([transcription], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcription.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const reset = () => {
    setOriginalAudio(null);
    setProcessedAudio(null);
    setTranscription('');
    setError(null);
    setIsPlayingOriginal(false);
    setIsPlayingProcessed(false);
  };

  const togglePlayOriginal = () => {
    originalWs.current?.playPause();
  };

  const togglePlayProcessed = () => {
    processedWs.current?.playPause();
  };

  const startLiveMode = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveStream.current = stream;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      liveAudioContext.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      
      // Original Analyser
      const origAnalyser = audioCtx.createAnalyser();
      origAnalyser.fftSize = 256;
      source.connect(origAnalyser);
      setOriginalAnalyser(origAnalyser);

      // Adaptive Filters (same as audioUtils)
      const hpFilter = audioCtx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = 450;

      const lpFilter = audioCtx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.value = 3500;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 1.2;

      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-20, audioCtx.currentTime);
      compressor.knee.setValueAtTime(30, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(10, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 2.8;

      const procAnalyser = audioCtx.createAnalyser();
      procAnalyser.fftSize = 256;

      source.connect(hpFilter);
      hpFilter.connect(lpFilter);
      lpFilter.connect(filter);
      filter.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(procAnalyser);
      setProcessedAnalyser(procAnalyser);

      // Live Transcription Setup
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are a live transcriber. Transcribe the user's speech accurately and concisely. Only output the transcription text.",
          inputAudioTranscription: {},
        },
        callbacks: {
          onmessage: (message: any) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setLiveTranscription(prev => prev + ' ' + message.serverContent?.modelTurn?.parts[0].text);
            }
            const inputTranscript = message.serverContent?.inputTranscription?.parts?.[0]?.text;
            if (inputTranscript) {
              setLiveTranscription(inputTranscript);
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Live transcription error. Check console.");
          }
        }
      });
      liveSession.current = session;

      // Send audio chunks to Live API
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      gainNode.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        // Base64 encode
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        session.sendRealtimeInput({
          audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      setIsLiveMode(true);
      setHasLiveResults(true);
      setError(null);
    } catch (err) {
      setError('Failed to start live mode.');
      console.error(err);
    }
  };

  const stopLiveMode = () => {
    if (liveStream.current) {
      liveStream.current.getTracks().forEach(track => track.stop());
    }
    if (liveAudioContext.current) {
      liveAudioContext.current.close();
    }
    if (liveSession.current) {
      liveSession.current.close();
    }
    setIsLiveMode(false);
    // Note: We don't clear analysers or transcription here so they remain visible
  };

  const clearLiveResults = () => {
    setOriginalAnalyser(null);
    setProcessedAnalyser(null);
    setLiveTranscription('');
    setHasLiveResults(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#f8fafc] font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header - Rack Mount Style */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white uppercase italic font-mono">
                ClearVoice <span className="text-indigo-500 not-italic">Pro</span>
              </h1>
            </div>
            <p className="text-slate-500 text-sm font-medium ml-1">Advanced Audio Restoration & AI Transcription</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={isLiveMode ? stopLiveMode : startLiveMode}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider transition-all border ${
                isLiveMode 
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse' 
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Activity className="w-4 h-4" />
              {isLiveMode ? 'Stop Live' : 'Live Mode'}
            </button>
            
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                <Mic className="w-4 h-4" />
                Record
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 bg-red-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 animate-pulse"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            )}

            <label className="flex items-center gap-2 bg-white/5 border border-white/10 text-slate-300 px-5 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider hover:bg-white/10 cursor-pointer transition-all active:scale-95">
              <Upload className="w-4 h-4" />
              Import
              <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </header>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3 text-sm font-medium"
          >
            <div className="w-2 h-2 rounded-full bg-red-500" />
            {error}
          </motion.div>
        )}

        {/* Main Console Grid */}
        <div className="grid grid-cols-1 gap-10">
          {/* Live Analysis - Full Width Rack */}
          <AnimatePresence>
            {hasLiveResults && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="hardware-card overflow-hidden"
              >
                <div className="bg-white/5 px-6 py-3 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${isLiveMode ? 'bg-red-500 animate-ping' : 'bg-slate-600'}`} />
                    <h2 className="mono-label text-white/90">{isLiveMode ? 'Live Analysis Engine' : 'Cached Session'}</h2>
                  </div>
                  {!isLiveMode && (
                    <button onClick={clearLiveResults} className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <p className="mono-label opacity-50">Input Pre-Filter</p>
                      <LiveSpectrogram analyser={originalAnalyser} color="#6366f1" label="Raw" sampleRate={16000} contextSampleRate={16000} />
                    </div>
                    <div className="space-y-2">
                      <p className="mono-label opacity-50">Output Post-Filter</p>
                      <LiveSpectrogram analyser={processedAnalyser} color="#10b981" label="Denoised" sampleRate={8000} contextSampleRate={16000} />
                    </div>
                  </div>

                  <div className="glass-panel p-5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="mono-label flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        Live Stream Text
                      </h3>
                      {!isLiveMode && liveTranscription && (
                        <button
                          onClick={() => {
                            const blob = new Blob([liveTranscription], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'live_transcription.txt';
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          Save TXT
                        </button>
                      )}
                    </div>
                    <div className="text-slate-300 leading-relaxed font-medium text-sm min-h-[3rem] max-h-40 overflow-y-auto scrollbar-hide">
                      {liveTranscription || (isLiveMode ? "Awaiting signal..." : "No data.")}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Processing Rack */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Original Signal */}
            <AnimatePresence>
              {originalAudio && (
                <motion.section
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="hardware-card flex flex-col"
                >
                  <div className="bg-white/5 px-6 py-3 border-b border-white/5 flex items-center justify-between">
                    <h2 className="mono-label text-white/90">Original Signal</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlayOriginal}
                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
                      >
                        {isPlayingOriginal ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <button onClick={reset} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-6 flex-1">
                    <div ref={originalWaveRef} className="bg-black/20 rounded-lg p-2 border border-white/5" />
                    <div className="space-y-2">
                      <p className="mono-label opacity-50">Frequency Map</p>
                      <div ref={originalSpectroRef} className="rounded-lg overflow-hidden grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-500" />
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Processed Signal */}
            <AnimatePresence>
              {processedAudio && (
                <motion.section
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="hardware-card flex flex-col glow-emerald border-emerald-500/10"
                >
                  <div className="bg-emerald-500/5 px-6 py-3 border-b border-emerald-500/10 flex items-center justify-between">
                    <h2 className="mono-label text-emerald-500">Processed Signal</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlayProcessed}
                        className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                      >
                        {isPlayingProcessed ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <button
                        onClick={downloadProcessed}
                        className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                      >
                        <Download className="w-3 h-3" />
                        Export
                      </button>
                    </div>
                  </div>

                  <div className="p-6 space-y-6 flex-1">
                    <div ref={processedWaveRef} className="bg-black/20 rounded-lg p-2 border border-emerald-500/5" />
                    <div className="space-y-2">
                      <p className="mono-label opacity-50 text-emerald-500/50">Frequency Map (Restored)</p>
                      <div ref={processedSpectroRef} className="rounded-lg overflow-hidden border border-emerald-500/5" />
                    </div>

                    <div className="glass-panel p-5 rounded-xl space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="mono-label flex items-center gap-2 text-emerald-500/70">
                          <FileText className="w-3 h-3" />
                          AI Script
                        </h3>
                        <div className="flex items-center gap-2">
                          {isTranscribing && (
                            <span className="text-[10px] text-indigo-400 animate-pulse font-mono uppercase">Analyzing...</span>
                          )}
                          {transcription && (
                            <button
                              onClick={downloadTranscription}
                              className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              TXT
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-slate-300 text-sm leading-relaxed max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {transcription || (isTranscribing ? 'Decoding signal...' : 'Ready for analysis.')}
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>

          {/* Processing Overlay */}
          {isProcessing && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-indigo-500/20 rounded-full animate-spin border-t-indigo-500" />
                <Activity className="w-8 h-8 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-white font-bold uppercase tracking-widest text-sm">Audio Enhancement Active</p>
                <p className="text-slate-400 text-xs font-mono">Noise Reduction • Bandpass Filtering • Gain Normalization</p>
              </div>
            </div>
          )}
        </div>

        {/* Empty State - Dashboard Style */}
        {!originalAudio && !isRecording && !isProcessing && !hasLiveResults && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-32 text-center space-y-8"
          >
            <div className="relative">
              <div className="w-32 h-32 bg-indigo-500/5 rounded-full flex items-center justify-center text-indigo-500/20">
                <Mic className="w-16 h-16" />
              </div>
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0 bg-indigo-500/10 rounded-full blur-3xl"
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-bold text-white uppercase tracking-tight">System Ready</h3>
              <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed">
                Connect a microphone or import a source file to begin professional-grade audio restoration.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-indigo-500" />
                <span className="mono-label opacity-30">Standby</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
