import { LocalStorageItem } from '@/constants';
import axios from 'axios';

const tvAIInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_TV_AI_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.NEXT_PUBLIC_TV_AI_API_KEY,
  },
});

export interface AIArtworkResponse {
  series_id: string;
  reason: string;
}

export class ConversationService {
  public async getConversation(message: string): Promise<AIArtworkResponse> {
    const personalization_id = localStorage.getItem(LocalStorageItem.name);
    const response = await tvAIInstance.post('/conversation', {
      message,
      personalization_id,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const conversation = response.data.response as string;
    const aiArtworkResponse = JSON.parse(conversation) as AIArtworkResponse;
    return aiArtworkResponse;
  }
}
