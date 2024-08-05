import { Artwork } from "@/utils/types"
import Image from "next/image"
import QRCode from "qrcode.react"
import ArtworkPlayer from "./artworkPlayer"
import { useEffect, useState } from "react"

const HomePage = ({deviceName, branchLink, currentArtwork}: {deviceName: string, branchLink: string, currentArtwork: Artwork}) => {
  const [previewURL, setPreviewURL] = useState<string | null>(null);

  useEffect(() => {
    const formatPreviewURL = (previewURI: string) => {
      if (previewURI.startsWith('https')) {
        return previewURI;
      } else {
        return `${process.env.NEXT_PUBLIC_CLOUD_FRONT_ENDPOINT}${previewURI}`;
      }
    }
    if (currentArtwork) {
      setPreviewURL(formatPreviewURL(currentArtwork.previewURI));
    }
  }, [currentArtwork])
return (
  <div style={{ display: 'flex', height: '100vh' }}>
  <div style={{ flex: 1, backgroundColor: '#2C2C2C', color: '#FFFFFF', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
    <div>
      <Image src="/feralfile-logo.svg" alt="Feral File Logo" width={288} height={23} />
      <h1 style={{fontSize: 48, paddingTop: 80}}>Display exhibitions and your collection to any screen</h1>
      <p style={{fontSize: 22, paddingTop: 40}}>Open the Feral File app on your phone to sync your collection.</p>
      <h2 style={{fontSize: 22, fontWeight: 'bold', paddingTop: 40}}>Display Name: {deviceName}</h2>
    </div>
    <div>
      {branchLink ? (
        <div style={{padding: 10, backgroundColor: 'white', width: 'fit-content'}}>
          <QRCode value={branchLink} size={250} />
        </div>
      ) : (
        <p>Connecting...</p>
      )}
    </div>
    <div>
      <p>{currentArtwork?.artistAlias}</p>
      <p>{currentArtwork?.series?.title}</p>
    </div>
  </div>
  <div style={{ flex: 2, position: 'relative' }}>
    <ArtworkPlayer previewURL={previewURL!} />
  </div>
</div>
)
}

export default HomePage;