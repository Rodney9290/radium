import { useState, useEffect } from 'react';
import { Button } from '../shared/Button';

interface WelcomeModalProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    icon: '☢️',
    title: 'Welcome to Radium',
    description: 'A desktop GUI for Proxmark3. Clone RFID and NFC cards without touching the command line.',
  },
  {
    icon: '🔧',
    title: 'What You Need',
    items: [
      { icon: '📟', text: 'Proxmark3 device (Easy, RDV4, or compatible)' },
      { icon: '🔌', text: 'USB cable' },
      { icon: '💳', text: 'Blank magic cards (T5577 for LF, Gen1a/CUID for HF)' },
    ],
  },
  {
    icon: '📋',
    title: 'How It Works',
    steps: [
      { num: '1', label: 'Connect', desc: 'Plug in your Proxmark3 and connect' },
      { num: '2', label: 'Scan', desc: 'Place your original card on the reader' },
      { num: '3', label: 'Blank', desc: 'Swap to a blank magic card' },
      { num: '4', label: 'Write', desc: 'Radium clones the data automatically' },
    ],
  },
  {
    icon: '✅',
    title: "You're Ready",
    description: 'Connect your Proxmark3 and start cloning. Radium handles the rest.',
  },
];

export function WelcomeModal({ onComplete }: WelcomeModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);
  const slide = SLIDES[currentSlide];
  const isLast = currentSlide === SLIDES.length - 1;
  const isFirst = currentSlide === 0;

  // Backdrop fade in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const goToSlide = (next: number) => {
    setSlideVisible(false);
    setTimeout(() => {
      setCurrentSlide(next);
      setSlideVisible(true);
    }, 200);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s ease',
    }}>
      <div style={{
        maxWidth: '480px',
        width: '90%',
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: 'var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-6)',
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
      }}>
        {/* Skip button */}
        {!isLast && (
          <button
            onClick={onComplete}
            style={{
              position: 'absolute',
              top: 'var(--space-4)',
              right: 'var(--space-4)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
              padding: 'var(--space-1) var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            Skip
          </button>
        )}

        {/* Slide content with fade transition */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-6)',
          width: '100%',
          opacity: slideVisible ? 1 : 0,
          transform: slideVisible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}>
          {/* Icon with pulse animation on entrance */}
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            animation: slideVisible ? 'modalIconPop 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
          }}>
            <style>{`
              @keyframes modalIconPop {
                0% { transform: scale(0.8); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
              }
              @keyframes staggerIn {
                0% { opacity: 0; transform: translateY(10px); }
                100% { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            {slide.icon}
          </div>

          {/* Title */}
          <div style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            textAlign: 'center',
          }}>
            {slide.title}
          </div>

          {/* Description */}
          {'description' in slide && slide.description && (
            <div style={{
              fontSize: '15px',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              lineHeight: '1.6',
              maxWidth: '360px',
            }}>
              {slide.description}
            </div>
          )}

          {/* Items with staggered entrance */}
          {'items' in slide && slide.items && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              width: '100%',
            }}>
              {slide.items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  animation: slideVisible ? `staggerIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 100}ms both` : 'none',
                }}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>{item.icon}</span>
                  {item.text}
                </div>
              ))}
            </div>
          )}

          {/* Steps with staggered entrance */}
          {'steps' in slide && slide.steps && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-3)',
              width: '100%',
            }}>
              {slide.steps.map((step, i) => (
                <div key={step.num} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  padding: 'var(--space-4)',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  animation: slideVisible ? `staggerIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 100}ms both` : 'none',
                }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-accent)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}>
                    {step.num}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {step.desc}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dot indicators */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          justifyContent: 'center',
        }}>
          {SLIDES.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === currentSlide ? '20px' : '8px',
                height: '8px',
                borderRadius: 'var(--radius-full)',
                background: i === currentSlide ? 'var(--color-accent)' : 'var(--border-secondary)',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          ))}
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-3)',
          width: '100%',
          justifyContent: 'center',
        }}>
          {!isFirst && (
            <Button variant="secondary" onClick={() => goToSlide(currentSlide - 1)}>
              Back
            </Button>
          )}
          {isLast ? (
            <Button variant="primary" size="lg" onClick={onComplete}>
              Get Started
            </Button>
          ) : (
            <Button variant="primary" onClick={() => goToSlide(currentSlide + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
