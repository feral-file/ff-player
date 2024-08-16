'use client';

import ArtworkPlayer from '@/components/ArtworkPlayer';
import { SeriesService } from '@/services';
import { ConversationService } from '@/services/conversationService';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition {
  start(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export default function AIArtworkClient() {
  // Services
  const conversationService = useRef(new ConversationService());
  const seriesService = useRef(new SeriesService());
  const [seriesID, setSeriesID] = useState<string>('');
  const [previewURL, setPreviewURL] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);

  useEffect(() => {
    handleOnRecord();
  }, []);

  function handleOnRecord() {
    setIsRecording(true);

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.start();

    recognition.onresult = async function (event) {
      const transcript = event.results[0][0].transcript;
      const aiArtwork =
        await conversationService.current.getConversation(transcript);
      if (!aiArtwork) {
        setIsRecording(false);
        setPreviewURL('');
        return;
      }

      // Check if the browser supports speechSynthesis
      if ('speechSynthesis' in window) {
        if (aiArtwork.reason) {
          const utterance = new SpeechSynthesisUtterance(aiArtwork.reason);
          window.speechSynthesis.speak(utterance);
        }
      } else {
        console.log('Text-to-Speech is not supported in this browser.');
      }
      setSeriesID(aiArtwork.series_id);
    };
  }

  useEffect(() => {
    if (!seriesID) {
      return;
    }

    setIsRecording(false);

    const handleSeries = async () => {
      const artworks = await seriesService.current.getArtworkOfSeries(
        seriesID,
        'limit=1&offset=0'
      );
      if (!artworks.length) {
        return;
      }

      const previewURL = seriesService.current.getArtworkPreview(artworks[0]);
      if (previewURL) {
        setPreviewURL(previewURL);
      }
    };

    handleSeries();
  }, [seriesID]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {isRecording && <div>Recording...</div>}
      {!isRecording && !previewURL && (
        <div>
          We can't find any artwork.{' '}
          <button onClick={handleOnRecord}>Please try again</button>
        </div>
      )}
      {!isRecording && previewURL && <ArtworkPlayer previewURL={previewURL} />}
    </div>
  );
}
