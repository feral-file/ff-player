'use client';

import { ConversationService } from '@/services/conversationService';
import { useRef } from 'react';

export default function AIArtworkClient() {
  // Services
  const conversationService = useRef(new ConversationService());

  function handleOnRecord() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.start();

    recognition.onresult = async function (event) {
      const transcript = event.results[0][0].transcript;
      conversationService.current.getConversation(transcript);
      console.log('transcript', transcript);
    };
  }
  return (
    <div>
      <button
        onClick={handleOnRecord}
        className="border-none bg-transparent w-10">
        {/* Microphone icon component */}
        Start
      </button>
    </div>
  );
}
