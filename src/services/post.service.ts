import { AppSettings } from '@/constants';
import {
  Exhibition,
  Post,
  PostMediaType,
  PostType,
  YoutubeThumbnailVariants,
} from '@/models';
import { Jg043CustomPosts } from '@/models/jg043.model';
import axios from 'axios';
import * as Sentry from '@sentry/nextjs';

const YOUTUBE_VIDEO_QUERY_PARAM_KEY = 'v';
const YOUTUBE_URL = 'https://www.youtube.com';
const YOUTUBE_THUMBNAIL_URL =
  'https://img.youtube.com/vi/{video-id}/{variant}.jpg';
const YOUTUBE_VIDEO_URL = 'https://www.youtube.com/embed/{video-id}';

class PostService {
  public async getExhibitionPosts(exhibition: Exhibition): Promise<Post[]> {
    try {
      const isJG043Show = exhibition.id === AppSettings.JG_043_EXHIBITION_ID;
      const isEF046Exhibition =
        exhibition.id === AppSettings.EF_046_EXHIBITION_ID;
      let posts = exhibition.posts ?? [];
      const curatorNote = {
        id: 'curatorNote',
        type: isJG043Show ? PostType.ArtistNote : PostType.CuratorNote,
        title: exhibition.noteTitle,
        content: exhibition.noteBrief,
      } as Post;
      if (isJG043Show) {
        const J043Customs = await this.getCustomPostOfJG043Show();
        posts = [curatorNote, ...J043Customs, ...posts];
      } else if (isEF046Exhibition) {
        const EF43Customs = await this.getCustomPostOfEF046Exhibition();
        posts = [...EF43Customs, ...posts];
      } else {
        posts = [curatorNote, ...posts];
      }

      for (const post of posts) {
        this.formatPost(post);
      }
      return posts;
    } catch (error) {
      console.log(
        '[API] Failed to load post exhibition:',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
      return [];
    }
  }

  private async getCustomPostOfEF046Exhibition() {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''}/configs/app.json`
      );

      const appConfigData = response.data as {
        exhibition?: {
          foreword?: Record<string, string[]>;
        };
      } | null;

      const forewordSection = appConfigData?.exhibition?.foreword;
      const forewords = forewordSection?.[AppSettings.EF_046_EXHIBITION_ID];

      if (forewords) {
        const posts = forewords.map((foreword, index) => {
          const id = `foreword_${AppSettings.EF_046_EXHIBITION_ID}_${index.toString()}`;
          return {
            id: id,
            type: PostType.Foreword,
            title: 'Foreword',
            content: foreword,
          } as Post;
        });
        return posts;
      }

      return [];
    } catch (error) {
      console.log(
        '[API] Failed to load post of EF046 exhibition',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
      return [];
    }
  }

  private async getCustomPostOfJG043Show(): Promise<Post[]> {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_PUB_DOC_URL ?? ''}/configs/app.json`
      );

      const jg043Section = response.data as Jg043CustomPosts | null;
      if (jg043Section?.john_gerrard?.custom_notes?.length) {
        const posts: Post[] = jg043Section.john_gerrard.custom_notes.map(
          note => {
            return {
              id: note.id,
              type: PostType.J043Custom,
              title: note.title,
              content: note.content,
            } as Post;
          }
        );
        return posts;
      }
      return [];
    } catch (error) {
      console.log(
        '[API] Failed to load post of jg43 exhibition',
        JSON.stringify(error)
      );
      Sentry.captureException(error);
      return [];
    }
  }

  private formatPost(resource: Post) {
    try {
      if (!resource.coverURI) {
        return;
      }

      const url = new URL(resource.coverURI);
      if (url.hostname === new URL(YOUTUBE_URL).hostname) {
        const videoId = url.searchParams.get(YOUTUBE_VIDEO_QUERY_PARAM_KEY);
        resource.mediaType = PostMediaType.Video;
        if (videoId) {
          resource.thumbUrls = [];
          for (const variant of Object.values(YoutubeThumbnailVariants)) {
            resource.thumbUrls.push(
              YOUTUBE_THUMBNAIL_URL.replaceAll(
                /{video-id}/g,
                videoId
              ).replaceAll(/{variant}/g, variant)
            );
          }

          resource.videoUrl = YOUTUBE_VIDEO_URL.replace('{video-id}', videoId);
        }
      } else {
        resource.thumbUrls = [resource.coverURI];
      }
    } catch (error) {
      console.log('[API] Failed to format post:', JSON.stringify(error));
      Sentry.captureException(error);
    }
  }
}

export const postService = new PostService();
