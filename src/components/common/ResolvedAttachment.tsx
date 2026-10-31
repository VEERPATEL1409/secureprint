import React, { useEffect, useState } from 'react';
import { resolveFileUrlCrossInstance } from '../../services/storageService';
import { normalizeFileUrl } from '../../utils/printEngine';

interface ResolvedImageProps {
  src: string;
  storagePath?: string;
  mimeType?: string;
  alt: string;
  className?: string;
}

export const ResolvedImage: React.FC<ResolvedImageProps> = ({
  src,
  storagePath,
  mimeType,
  alt,
  className = ''
}) => {
  const norm = normalizeFileUrl(src);
  const [resolvedSrc, setResolvedSrc] = useState<string>(norm);

  useEffect(() => {
    let active = true;
    setResolvedSrc(norm);
    resolveFileUrlCrossInstance(norm, storagePath, mimeType).then((url) => {
      if (active && url) {
        setResolvedSrc(url);
      }
    });
    return () => {
      active = false;
    };
  }, [norm, storagePath, mimeType]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
    />
  );
};

interface ResolvedDownloadLinkProps {
  href: string;
  storagePath?: string;
  mimeType?: string;
  fileName: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

export const ResolvedDownloadLink: React.FC<ResolvedDownloadLinkProps> = ({
  href,
  storagePath,
  mimeType,
  fileName,
  className = '',
  title,
  children
}) => {
  const defaultDownload = normalizeFileUrl(href, true);
  const [resolvedHref, setResolvedHref] = useState<string>(defaultDownload);

  useEffect(() => {
    let active = true;
    const norm = normalizeFileUrl(href);
    resolveFileUrlCrossInstance(norm, storagePath, mimeType).then((url) => {
      if (!active) return;
      if (url.startsWith('blob:') || url.startsWith('data:')) {
        setResolvedHref(url);
      } else {
        setResolvedHref(normalizeFileUrl(url, true));
      }
    });
    return () => {
      active = false;
    };
  }, [href, storagePath, mimeType]);

  return (
    <a
      href={resolvedHref}
      download={fileName}
      title={title}
      className={className}
    >
      {children}
    </a>
  );
};
