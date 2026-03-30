import { useState, useEffect, useRef } from 'react';

export default function AnimatedNumber({ value, duration = 600, className = '', style = {} }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);
  const startRef = useRef(null);
  const prevRef = useRef(0);

  useEffect(() => {
    if (value === undefined || value === null) return;

    const from = prevRef.current;
    const to = Number(value);
    if (from === to) return;

    startRef.current = performance.now();

    const animate = (now) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);

      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return <span className={className} style={style}>{display}</span>;
}
