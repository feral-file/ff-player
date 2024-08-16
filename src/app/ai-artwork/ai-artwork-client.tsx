'use client';

import ArtworkPlayer from '@/components/ArtworkPlayer';
import { SeriesService } from '@/services';
import { ConversationService } from '@/services/conversationService';
import { useEffect, useRef, useState } from 'react';
import styles from './styles.module.scss';
import clsx from 'clsx';
import Microphone from '@/components/Microphone';

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
  const [speechText, setSpeechText] = useState<string>('');

  useEffect(() => {
    handleOnRecord();
  }, []);

  function handleOnRecord() {
    setIsRecording(true);
    setSpeechText('');

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.start();

    recognition.onresult = async function (event) {
      const transcript = event.results[0][0].transcript;
      debounce(handleSpeechText(transcript), 500);
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

  const handleSpeechText = async (text: string) => {
    console.log('Text record: ', text);
    setSpeechText(text);
    const aiArtwork = await conversationService.current.getConversation(text);
    if (!aiArtwork) {
      setIsRecording(false);
      setPreviewURL('');
      return;
    }

    // Check if the browser supports speechSynthesis
    if ('speechSynthesis' in window) {
      if (aiArtwork.reason) {
        const utterance = new SpeechSynthesisUtterance(aiArtwork.reason);
        utterance.rate = 0.7;
        window.speechSynthesis.speak(utterance);
      }
    } else {
      console.log('Text-to-Speech is not supported in this browser.');
    }
    setSeriesID(aiArtwork.series_id);
  };

  function debounce(fn: any, delay: number) {
    let timeoutId: NodeJS.Timeout;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {isRecording && (
        <div className={clsx(styles.record)}>
          {speechText ? speechText : 'Say something...'}
        </div>
      )}
      {!isRecording && !previewURL && (
        <div className={clsx(styles.record)}>
          We can't find any artwork, please try again
        </div>
      )}
      {!isRecording && previewURL && <ArtworkPlayer previewURL={previewURL} />}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          cursor: 'pointer',
        }}>
        <Microphone onClick={handleOnRecord} />
      </div>
    </div>
  );
}
