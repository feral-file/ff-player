'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

const logTimestamp = () => new Date().toISOString();

const GlobalErrorListener = () => {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMessage =
        event.message ||
        (event.error && 'message' in event.error
          ? (event.error as Error).message
          : '') ||
        'Unknown error';
      const timestamp = logTimestamp();

      console.error('[Global Error] Error detected:', {
        message: errorMessage,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        type: event.type,
        userAgent: navigator.userAgent,
        timestamp,
        currentURL: window.location.href,
        referrer: document.referrer,
      });

      Sentry.captureMessage('Global error detected', {
        level: 'error',
        extra: {
          error: errorMessage,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          userAgent: navigator.userAgent,
          timestamp,
          currentURL: window.location.href,
          referrer: document.referrer,
        },
        tags: {
          errorType: 'global_error',
          stage: 'global_error_handler',
          target:
            event.target instanceof HTMLElement
              ? event.target.tagName
              : 'unknown',
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorMessage =
        (event.reason &&
        typeof event.reason === 'object' &&
        'message' in event.reason
          ? (event.reason as Error).message
          : '') ||
        String(event.reason) ||
        'Unknown rejection';
      const timestamp = logTimestamp();

      console.error('[Global Error] Promise rejection:', {
        reason: String(event.reason),
        message: errorMessage,
        userAgent: navigator.userAgent,
        timestamp,
        currentURL: window.location.href,
        referrer: document.referrer,
      });

      Sentry.captureMessage('Unhandled promise rejection', {
        level: 'error',
        extra: {
          error: errorMessage,
          reason: event.reason,
          userAgent: navigator.userAgent,
          timestamp,
          currentURL: window.location.href,
          referrer: document.referrer,
        },
        tags: {
          errorType: 'unhandled_rejection',
          stage: 'unhandled_rejection',
        },
      });
    };

    const handleDocumentErrorCapture = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName !== 'IFRAME') {
        return;
      }

      const iframe = target as HTMLIFrameElement;
      const timestamp = logTimestamp();
      console.error('[Global Error] Iframe error:', {
        src: iframe.src,
        userAgent: navigator.userAgent,
        timestamp,
        currentURL: window.location.href,
      });

      Sentry.captureMessage('Iframe error detected', {
        level: 'error',
        extra: {
          iframeSrc: iframe.src,
          userAgent: navigator.userAgent,
          timestamp,
          currentURL: window.location.href,
        },
        tags: {
          errorType: 'iframe_error',
          stage: 'iframe_loading',
          component: 'iframe',
        },
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    document.addEventListener('error', handleDocumentErrorCapture, true);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection
      );
      document.removeEventListener('error', handleDocumentErrorCapture, true);
    };
  }, []);

  return null;
};

export default GlobalErrorListener;
