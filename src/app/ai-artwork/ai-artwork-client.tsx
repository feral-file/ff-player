'use client';

import ArtworkPlayer from '@/components/ArtworkPlayer';
import { SeriesService } from '@/services';
import { ConversationService } from '@/services/conversationService';
import { useEffect, useRef, useState } from 'react';
import styles from './styles.module.scss';
import clsx from 'clsx';
import { AIRecordedKeyCodes, KeyCodes, LocalStorageItem } from '@/constants';
import Microphone, {
  MicrophoneState,
} from '@/components/microphone/Microphone';

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition {
  start(): void;
  abort(): void; // Added for cleanup purposes
  onaudioend: () => void;
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
  const [isGettingArtwork, setIsGettingArtwork] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [isDisplayWebAction, setIsDisplayWebAction] = useState<boolean>(false);

  const recognition = useRef<SpeechRecognition | null>(null);
  const lastEventTime = useRef(0);

  useEffect(() => {
    console.log('AIArtworkClient mounted');
    handleOnRecord();

    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const minInterval = 200; // Minimum interval between events in milliseconds

      if (now - lastEventTime.current > minInterval) {
        lastEventTime.current = now;
        if (AIRecordedKeyCodes.includes(event.keyCode as KeyCodes)) {
          handleOnRecord(true);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    // Cleanup on component unmount
    return () => {
      if (recognition.current) {
        recognition.current.abort();
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const platform = localStorage.getItem(LocalStorageItem.platform);
    setIsDisplayWebAction(!platform);
  }, [isDisplayWebAction]);

  function handleOnRecord(isForceRecord = false) {
    console.log('isRecording:', isRecording, isForceRecord);
    if (isRecording && !isForceRecord) {
      return;
    }

    setIsRecording(true);
    setPreviewURL('');
    setMessage('');

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('Speech Recognition is not supported in this browser.');
      setIsRecording(false);
      return;
    }

    console.log('Starting Speech Recognition...');

    if (recognition.current) {
      recognition.current.abort();
    }

    recognition.current = new SpeechRecognition();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    recognition.current.start();
    console.log('Speech Recognition started');

    const debounceHandling = debounce(handleSpeechText, 1000);

    let script = '';

    recognition.current.onresult = function (event) {
      try {
        const transcript = event.results[0][0].transcript;
        script = transcript;
        console.log('Transcript received:', transcript);
        setIsGettingArtwork(true);
        debounceHandling(transcript);
      } catch (error) {
        console.error('Error in onresult:', error);
        setIsRecording(false);
      }
    };

    recognition.current.onaudioend = () => {
      console.log('Audio end', script);
      if (!script) {
        handleOnRecord(true);
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
          setMessage("We can't find any artwork, please try again");
          return;
        }

        const previewURL = seriesService.current.getArtworkPreview(artworks[0]);
        if (previewURL) {
          setPreviewURL(previewURL);
        }
      } catch (error) {
        setMessage('Failed to get artwork, please try again');
        console.error('Error fetching artworks:', error);
      }
    };

    handleSeries();
  }, [seriesID]);

  const handleSpeechText = async (text: string) => {
    try {
      console.log('Text record: ', text);
      setMessage(text);
      const aiArtwork = await conversationService.current.getConversation(text);
      console.log('AI Artwork:', aiArtwork);
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
      setMessage('Failed to get conversation, please try again');
    } finally {
      setIsGettingArtwork(false);
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
      {message && !previewURL && (
        <div className={clsx(styles.message)}>
          <p style={{ fontSize: 36 }}>{message}</p>
        </div>
      )}
      {!message && !previewURL && (
        <div className={clsx(styles.message)}>
          <ul style={{ fontSize: 36 }}>
            Ask me to find you the perfect artwork for any situation...
          </ul>
          <br></br>
          <li style={{ fontSize: 24 }}>
            “Suggest artwork for my living room.”
          </li>
          <li style={{ fontSize: 24 }}>“Find something happy and vibrant.”</li>
          <li style={{ fontSize: 24 }}>“Recommend art for a dinner party.”</li>
        </div>
      )}
      {!isRecording && previewURL && <ArtworkPlayer previewURL={previewURL} />}
      {!isGettingArtwork && isDisplayWebAction && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            cursor: 'pointer',
          }}>
          <Microphone
            onClick={() => {
              handleOnRecord(true);
            }}
            state={MicrophoneState.Active}
          />
        </div>
      )}
    </div>
  );
}
