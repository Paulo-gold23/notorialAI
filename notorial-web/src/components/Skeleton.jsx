import React from 'react';

export function Skeleton({ width = '100%', height = '0.75rem', className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Skeleton className="skeleton-text-lg" style={{ marginBottom: '0.75rem' }} />
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Skeleton className="skeleton-text-sm" width="60px" />
            <Skeleton className="skeleton-text-sm" width="50px" />
            <Skeleton className="skeleton-text-sm" width="70px" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Skeleton className="skeleton-badge" />
          <Skeleton width="60px" height="1.5rem" style={{ borderRadius: '0.375rem' }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
