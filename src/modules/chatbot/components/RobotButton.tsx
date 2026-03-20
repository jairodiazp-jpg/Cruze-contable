import React, { useEffect, useRef } from 'react';

/**
 * Botón flotante de robot con animación de parpadeo de ojos
 * Props:
 * - onClick: función al hacer click
 * - className: clases extra
 */
export const RobotButton: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className = '' }) => {
  const leftEye = useRef<HTMLDivElement>(null);
  const rightEye = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let blinkTimeout: NodeJS.Timeout;
    let isMounted = true;
    function blink() {
      if (!isMounted) return;
      if (leftEye.current && rightEye.current) {
        leftEye.current.style.height = '8px';
        rightEye.current.style.height = '8px';
        setTimeout(() => {
          if (!isMounted) return;
          leftEye.current!.style.height = '2px';
          rightEye.current!.style.height = '2px';
        }, 120);
        setTimeout(() => {
          if (!isMounted) return;
          leftEye.current!.style.height = '8px';
          rightEye.current!.style.height = '8px';
        }, 320);
      }
      blinkTimeout = setTimeout(blink, 2000 + Math.random() * 2000);
    }
    blinkTimeout = setTimeout(blink, 1000);
    return () => { isMounted = false; clearTimeout(blinkTimeout); };
  }, []);

  return (
    <button
      className={`rounded-full bg-primary text-white w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all ${className}`}
      aria-label="Abrir chatbot"
      onClick={onClick}
      style={{ position: 'relative', overflow: 'visible' }}
    >
      <div style={{ position: 'relative', width: 32, height: 32 }}>
        {/* Cara */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: '#fff', border: '2px solid #333', position: 'absolute', left: 0, top: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }} />
        {/* Ojos */}
        <div ref={leftEye} style={{ position: 'absolute', left: 8, top: 12, width: 6, height: 8, borderRadius: 3, background: '#222', transition: 'height 0.15s cubic-bezier(.4,0,.2,1)' }} />
        <div ref={rightEye} style={{ position: 'absolute', left: 18, top: 12, width: 6, height: 8, borderRadius: 3, background: '#222', transition: 'height 0.15s cubic-bezier(.4,0,.2,1)' }} />
        {/* Boca */}
        <div style={{ position: 'absolute', left: 10, top: 22, width: 12, height: 4, borderRadius: 2, background: '#eee', border: '1px solid #bbb' }} />
        {/* Antena */}
        <div style={{ position: 'absolute', left: 15, top: -8, width: 2, height: 10, background: '#333', borderRadius: 1 }} />
        <div style={{ position: 'absolute', left: 15, top: -10, width: 2, height: 2, background: '#ffb300', borderRadius: 1 }} />
      </div>
    </button>
  );
};
