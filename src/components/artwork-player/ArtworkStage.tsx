import { MessageModalType, PreviewHTMLTag } from '@/models';
import { DP1DisplayPreference } from '@/models/dp1.model';
import type { CursorPosition } from '@/services/custom-hooks/useCursorPositions';
import { getDP1Margin } from '@/utils/helper';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import CursorLayer, { CursorLayerHandle } from '../CursorLayer';
import Loading from '../loading/loading';
import MessageModal from '../MessageModal';
import type { TransitionView } from './ArtworkTransition';

export interface LoadingView {
  globalLoading: boolean;
  showLoading: boolean;
  showMessageModal: boolean;
  messageModalText: string | null;
  messageModalTitle: string | null;
}

/** Avoids stacking the global overlay over a model's already-visible loading panel. */
export function showsGlobalLoading(
  view: TransitionView,
  loading: LoadingView,
  url: string,
  enabled: boolean
) {
  const visibleLoadingModel = ([0, 1] as const).some(
    index =>
      view.slots[index]?.previewType === PreviewHTMLTag.model &&
      view.slots[index]?.loading &&
      view.slots[index]?.previewURL === url &&
      view.slotOpacity[index] > 0
  );
  return (
    !visibleLoadingModel &&
    loading.showLoading &&
    loading.globalLoading &&
    enabled
  );
}

/** Keeps both fade layers inside the matte while cursor and loading surfaces cover the full screen. */
export function ArtworkStage(props: {
  settings: DP1DisplayPreference | undefined;
  loading: LoadingView;
  showLoading: boolean;
  cursorPositions?: CursorPosition[] | null;
  children: ReactNode;
}) {
  const { settings, loading, cursorPositions } = props;
  const cursor = useRef<CursorLayerHandle>(null);
  useEffect(() => {
    if (cursorPositions?.length) {
      cursor.current?.setPositions(cursorPositions);
    }
  }, [cursorPositions]);
  return (
    <>
      <div
        style={{
          display: 'flex',
          backgroundColor: settings?.background ?? '#000000',
          justifyContent: 'center',
          position: 'relative',
          transition: 'padding 0.2s ease, background-color 0.2s ease',
          padding: settings?.margin ? getDP1Margin(settings.margin) : '0px',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
        }}>
        <CursorLayer ref={cursor} />
        {props.showLoading && <Loading />}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {props.children}
        </div>
      </div>
      {loading.showMessageModal && (
        <MessageModal
          screenRatio={1}
          message={loading.messageModalText ?? ''}
          messageModalType={MessageModalType.info}
          title={loading.messageModalTitle ?? ''}
        />
      )}
    </>
  );
}
