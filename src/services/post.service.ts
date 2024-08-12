import {
  Exhibition,
  Post,
  PostMediaType,
  PostType,
  YoutubeThumbnailVariants,
} from '@/models';

const YOUTUBE_VIDEO_QUERY_PARAM_KEY = 'v';
const YOUTUBE_URL = 'https://www.youtube.com';
const YOUTUBE_THUMBNAIL_URL =
  'https://img.youtube.com/vi/{video-id}/{variant}.jpg';
const YOUTUBE_VIDEO_URL = 'https://www.youtube.com/embed/{video-id}';

export class PostService {
  public getPostExhibition(exhibition: Exhibition): Post[] {
    try {
      let posts = exhibition.posts || [];
      const curatorNote = {
        id: 'curatorNote',
        type: PostType.Note,
        title: exhibition?.noteTitle,
        content: exhibition?.noteBrief,
      } as Post;
      posts = [curatorNote, ...posts];
      for (const post of posts) {
        this.formatPost(post);
      }
      return posts;
    } catch (error) {
      console.log('Failed to load exhibition:', error);
      return [];
    }
  }

  private formatPost(resource: Post) {
    try {
      if (!resource.coverURI) {
        return;
      }

      const url = new URL(resource.coverURI!);
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
      console.log('Failed to format post:', error);
    }
  }
}
