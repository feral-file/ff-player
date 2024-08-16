import axios from 'axios';
import axiosInstance from './axiosService';

const tvAIInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_TV_AI_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.NEXT_PUBLIC_TV_AI_API_KEY,
  },
});

export class ConversationService {
  public async getConversation(text: string): Promise<string> {
    try {
      const response = await tvAIInstance.post('/conversations', {
        text,
      });

      console.log('---Kien---', response);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const conversation = response.data.result as string;

      return conversation;
    } catch (error) {
      console.log('Failed to get conversation:', error);
      return '';
    }
  }
}
