import type { ReactNode } from 'react';
import { cx } from '../lib/utils';

interface BookCoverProps {
  title: string;
  cover?: string;
  className?: string;
  children?: ReactNode;
}

const TONES = ['#E7DFD2', '#E3E6DF', '#E6E1E8', '#E9E2D6', '#E4E0D6'];

export function BookCover({ title, cover, className, children }: BookCoverProps) {
  if (cover) {
    return (
      <div className={cx('cover', className)}>
        <img src={cover} alt={`${title} 封面`} loading="lazy" />
        {children}
      </div>
    );
  }

  let hash = 0;
  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) % 997;
  }
  const tone = TONES[hash % TONES.length];

  return (
    <div className={cx('cover', className)}>
      <div className="cover-fallback" style={{ ['--tone' as string]: tone }}>
        <span className="cover-fallback-title">{title}</span>
      </div>
      {children}
    </div>
  );
}
