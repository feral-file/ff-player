import { Artwork, ViewMode } from "@/utils/types"
import Image from "next/image"
import QRCode from "qrcode.react"
import ArtworkPlayer from "./artworkPlayer"
import { useEffect, useState } from "react"
import clsx from 'clsx';
import styles from '../styles/global.module.scss'

const HomePage = ({screenRatio, viewMode, deviceName, branchLink, currentArtwork}: {screenRatio: number, viewMode: ViewMode, deviceName: string, branchLink: string, currentArtwork: Artwork}) => {
  const [previewURL, setPreviewURL] = useState<string | null>(null);

  useEffect(() => {
    const formatPreviewURL = (previewURI: string) => {
      if (previewURI.startsWith('https')) {
        return previewURI;
      } else {
        return `${process.env.NEXT_PUBLIC_FERAL_FILE_ASSET_URL!}/${previewURI}`;
      }
    }
    if (currentArtwork) {
      setPreviewURL(formatPreviewURL(currentArtwork.previewURI));
    }
  }, [currentArtwork])
return (
  <div className={clsx(viewMode === ViewMode.landscape ? styles.landscape : styles.portrait)}>
    <div className={clsx(styles.container)}>
      <div className={clsx(styles.info)}>
        <div className={clsx(styles.top)}>
          <Image src="/feralfile-logo.svg" alt="Feral File Logo" width={288 * screenRatio} height={23 * screenRatio} />
          <h1 style={{fontSize: 48 * screenRatio, paddingTop: 80 * screenRatio}}>Display exhibitions and your collection to any screen</h1>
          <p style={{fontSize: 22 * screenRatio, paddingTop: 40 * screenRatio}}>Open the Feral File app on your phone to sync your collection.</p>
        </div>
        <div className={clsx(styles.bottom)}>
          <div className={clsx(styles.qrcode)}>
            <h2 style={{fontSize: 22 * screenRatio, fontWeight: 'bold', paddingTop: 40 * screenRatio, paddingBottom: (viewMode === ViewMode.landscape ? 80 : 40) * screenRatio}}>Display Name: {deviceName}</h2>
            {branchLink ? (
              <div style={{padding: 10 * screenRatio, backgroundColor: 'white', width: 'fit-content'}}>
                <QRCode value={branchLink} size={250 * screenRatio} />
              </div>
            ) : (
              <p>Connecting...</p>
            )}
          </div>
          <div>
            <p style={{fontSize: 16 * screenRatio}}>{currentArtwork?.artistAlias}</p>
            <p style={{fontSize: 16 * screenRatio, fontWeight: 'bold', fontStyle: 'italic'}}>{currentArtwork?.series?.title}</p>
          </div>
        </div>
      </div>
      <div className={clsx(styles.viewer)}>
        <ArtworkPlayer previewURL={previewURL!} />
      </div>
    </div>
  </div>
)
}

export default HomePage;