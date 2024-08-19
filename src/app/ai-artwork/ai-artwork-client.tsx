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
  abort(): void; // Added for cleanup purposes
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

  let recognition: SpeechRecognition | null = null;

  useEffect(() => {
    console.log('AIArtworkClient mounted');
    handleOnRecord();

    // Cleanup on component unmount
    return () => {
      if (recognition) {
        recognition.abort();
      }
    };
  }, []);

  function handleOnRecord() {
    if (isRecording) {
      return;
    }

    setIsRecording(true);
    setSpeechText('');

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('Speech Recognition is not supported in this browser.');
      setIsRecording(false);
      return;
    }

    recognition = new SpeechRecognition();

    recognition.start();

    let debounceHandling = debounce(handleSpeechText, 1000);

    recognition.onresult = async function (event) {
      try {
        const transcript = event.results[0][0].transcript;
        console.log('Transcript received:', transcript);
        debounceHandling(transcript);
      } catch (error) {
        console.error('Error in onresult:', error);
        setIsRecording(false);
      }
    };
  }

  useEffect(() => {
    console.log('Series ID:', seriesID);
    if (!seriesID) {
      return;
    }

    setIsRecording(false);

    const handleSeries = async () => {
      try {
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
      } catch (error) {
        console.error('Error fetching artworks:', error);
      }
    };

    handleSeries();
  }, [seriesID]);

  const handleSpeechText = async (text: string) => {
    try {
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
    } catch (error) {
      console.error('Failed to get conversation:', error);
    }
  };

  function debounce(fn: any, delay: number) {
    let timeoutId: NodeJS.Timeout;
    return (...args: any) => {
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
