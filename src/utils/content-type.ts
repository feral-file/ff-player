import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseStreamVideo,
  FileUseVideo,
} from './types';

import { FileUseImage } from './types';

/**
 * Attempts to determine the content type of a URL by first making a HEAD request,
 * and if that fails, inferring from the file extension.
 *
 * @param previewURL The URL to check
 * @returns A string representing the content type
 */
export async function getContentTypeFromURL(
  previewURL: string
): Promise<string> {
  const url = new URL(previewURL);
  // The second request could be failed, Chrome uses the cached response from the first request, which has no "Access-Control-Allow-Origin" response header.
  // Workaround: Use a dummy "?x-some-key=some-value" query string parameter will convince the browser that the request is different.
  // Ref: https://serverfault.com/questions/856904/chrome-s3-cloudfront-no-access-control-allow-origin-header-on-initial-xhr-req/856948#856948
  const extendPreviewURL = url.search
    ? `${previewURL}&v=${Date.now().toString()}&x-request=xhr`
    : `${previewURL}?v=${Date.now().toString()}&x-request=xhr`;

  try {
    const response = await fetch(extendPreviewURL, {
      method: 'HEAD',
    });
    const contentType = response.headers.get('Content-Type');
    if (contentType) {
      return contentType;
    }
    throw new Error('No content type found in headers');
  } catch (error) {
    console.log(
      '[ContentType] Failed to get content-type from HEAD request',
      JSON.stringify(error)
    );

    const extension = url.pathname.split('.').pop()?.toLowerCase();
    if (extension) {
      let inferredType = '';
      if (FileUseImage.includes(extension)) {
        inferredType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
      } else if (FileUseVideo.includes(extension)) {
        inferredType = `video/${extension}`;
      } else if (FileUseAudio.includes(extension)) {
        inferredType = `audio/${extension}`;
      } else if (FileUseIframePDF.includes(extension)) {
        inferredType = 'application/pdf';
      } else if (FileUseStreamVideo.includes(extension)) {
        inferredType = 'application/x-mpegurl';
      }

      if (inferredType) {
        console.log('[ContentType] Inferred Content-Type:', inferredType);
        return inferredType;
      }
    }

    throw new Error(`Failed to determine content type: ${error}`);
  }
}
