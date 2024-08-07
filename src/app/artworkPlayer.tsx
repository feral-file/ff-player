import { FileUseAudio, FileUseIframe, FileUseIframePDF, FileUseImage, FileUseObject, FileUseVideo, MIMETypeAudio, MIMETypeImage, MIMETypeObject, MIMETypeUseStream, MIMETypeVideo, SeriesPreviewHTMLTag } from "@/utils/types";
import { useEffect, useState } from "react";

const ArtworkPlayer = ({previewURL}: {previewURL: string}) => {
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  function compareToGetFileType(type: string) {
    if (!type) {
      return;
    }

    if (MIMETypeUseStream.includes(type)) {
      setPreviewType(SeriesPreviewHTMLTag.video);
    } else if (FileUseIframe.includes(type)) {
      setPreviewType(SeriesPreviewHTMLTag.iframe);
    } else if (FileUseObject.includes(type) || type.match(MIMETypeObject)) {
      setPreviewType(SeriesPreviewHTMLTag.object);
    } else if (FileUseVideo.includes(type) || type.match(MIMETypeVideo)) {
      setPreviewType(SeriesPreviewHTMLTag.video);
    } else if (FileUseAudio.includes(type) || type.match(MIMETypeAudio)) {
      setPreviewType(SeriesPreviewHTMLTag.audio);
    } else if (FileUseImage.includes(type) || type.match(MIMETypeImage)) {
      setPreviewType(SeriesPreviewHTMLTag.image);
    } else if (FileUseIframePDF.includes(type)) {
      setPreviewType(SeriesPreviewHTMLTag.iframePDF);
    } else {
      setPreviewType(SeriesPreviewHTMLTag.iframe);
    }
  }

  useEffect(() => {
    const detectPreviewType = async (previewURL: string) => {
      try {
        const response = await fetch(previewURL, {method: 'HEAD'});
        const contentType = response.headers.get('Content-Type');
        compareToGetFileType(contentType!);
      } catch (error) {
        console.log('Error get content-type', error);

      }
    };

    if (previewURL) {
      setLoading(true);
      setPreviewType(null);
      detectPreviewType(previewURL);
    }
  }, [previewURL])

  const loadedSource = () => {
    setLoading(false);
  }

  return (
    <div style={{display: 'flex', width: '100%', height: '100%', backgroundColor: '#000000'}}>
      {(previewType === null || loading) && (<div style={{width: '100%', height: '100%', display: 'flex', position: 'absolute', top: 0}}><img style={{width: '100%', height: '100%', objectFit: 'contain'}} src="/ff-loading.gif"></img></div>)}
      {previewURL && previewType === SeriesPreviewHTMLTag.image && (
        <img style={{width: '100%', height: '100%', objectFit: 'contain'}} src={previewURL} alt="Artwork" onLoad={loadedSource}/>)}
      {previewURL && previewType === SeriesPreviewHTMLTag.object && (
        <object style={{width: '100%', height: '100%'}} data={previewURL} type="text/html" onLoad={loadedSource}>Not supported</object>)}
      {previewURL && previewType === SeriesPreviewHTMLTag.video && (
        <video style={{width: '100%', height: '100%'}} autoPlay={true} loop={true} onLoad={loadedSource}><source src={previewURL}></source></video>)}
      {previewURL && previewType === SeriesPreviewHTMLTag.audio && (
        <audio  autoPlay={true} loop={true}><source src={previewURL} onLoad={loadedSource}></source></audio>)}
      {previewURL && (previewType === SeriesPreviewHTMLTag.iframe || previewType === SeriesPreviewHTMLTag.iframePDF) && (
        <iframe style={{width: '100%', height: '100%'}} src={previewURL} onLoad={loadedSource}></iframe>)}
    </div>
  );
};

export default ArtworkPlayer;
