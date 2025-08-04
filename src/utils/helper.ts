import {
  Blockchain,
  ExhibitionContract,
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseStreamVideo,
  FileUseVideo,
  TokenMetadata,
} from '@/models';
import { Scaling } from '@/models/dp1.model';
import { infuraAxiosInstance } from '@/services/axiosService';
import Web3 from 'web3';
import { provider } from 'web3-core';

const web3 = new Web3(
  (Web3.givenProvider || 'wss://walletconnect.bitmark.com') as provider
);

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
    if (error instanceof Error) {
      console.log(
        '[ContentType] Failed to get content-type from HEAD request',
        error.message
      );
    } else {
      console.log(
        '[ContentType] Failed to get content-type from HEAD request',
        JSON.stringify(error)
      );
    }

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

    throw new Error(`Failed to determine content type: ${String(error)}`);
  }
}

export function bnToHex(
  bn: string | number | bigint,
  hasPrefix = true,
  length = 64
) {
  const base = 16;

  let hex: string;
  try {
    hex = BigInt(bn).toString(base);
  } catch (error: unknown) {
    console.log('[BNToHex] Error:', JSON.stringify(error));
    return bn.toString();
  }

  if (hasPrefix) {
    hex = hex.padStart(length, '0');
  }
  return hex;
}

export async function customPreviewFromTokenMetadata(
  contract?: ExhibitionContract,
  tokenID?: string,
  getMetadataFn = getTokenMetadataAnimationURL
): Promise<string | undefined> {
  if (!contract || !tokenID) {
    return undefined;
  }

  try {
    const animationURL = await getMetadataFn(contract, tokenID);
    if (!animationURL) {
      return undefined;
    }

    const httpResponse = await fetch(animationURL);
    const tokenURL = httpResponse.url;
    return tokenURL;
  } catch (error) {
    console.log(
      '[CustomPreviewFromTokenMetadata] Error:',
      JSON.stringify(error)
    );
    return undefined;
  }
}

export async function getTokenMetadataAnimationURL(
  contract: ExhibitionContract,
  tokenID: string
): Promise<string | undefined> {
  if (contract.blockchainType === Blockchain.Ethereum && tokenID) {
    const tokenIDHex = bnToHex(tokenID);
    const result = await infuraAxiosInstance.post<{ result: string }>('', {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [
        {
          to: contract.address,
          data: `0xc87b56dd${tokenIDHex}`, // Default interface is 8 digits at prefix
        },
        'latest',
      ],
      id: 1,
    });
    const tokenURL = String(
      web3.eth.abi.decodeParameter('string', result.data.result)
    );
    const tokenResponse = await fetch(tokenURL);
    const tokenMetadata = (await tokenResponse.json()) as TokenMetadata | null;
    return tokenMetadata?.animation_url;
  }

  return undefined;
}

export function convertScalingToObjectFit(
  scalingMode?: Scaling
): 'contain' | 'cover' | 'fill' {
  switch (scalingMode) {
    case Scaling.Fit:
      return 'contain';
    case Scaling.Fill:
      return 'cover';
    case Scaling.Stretch:
      return 'fill';
    default:
      return 'contain'; // Default to 'contain' for undefined or other values
  }
}

export function getDP1Margin(margin: number | string): string {
  if (typeof margin === 'number') {
    return `${String(margin)}px`;
  }

  if (margin.endsWith('%')) {
    const marginValue = Number(margin.replace('%', ''));
    return `${String(marginValue)}vh ${String(marginValue)}vw`;
  }

  return margin;
}
