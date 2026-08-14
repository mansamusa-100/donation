import { useState } from 'react';

export type PaymentBrandId = 'dpay' | 'wave' | 'yonna' | 'aps';

const BRAND_SOURCES: Record<PaymentBrandId, string[]> = {
  dpay: ['/payments/dpay.jpeg', '/payments/dpay.jpg', '/payments/dpay.png', '/payments/dpay.webp', '/payments/dpay.svg'],
  wave: ['/payments/wave.jpeg', '/payments/wave.jpg', '/payments/wave.png', '/payments/wave.webp', '/payments/wave.svg'],
  yonna: ['/payments/yonna.jpeg', '/payments/yonna.jpg', '/payments/yonna.png', '/payments/yonna.webp', '/payments/yonna.svg'],
  aps: ['/payments/aps.jpeg', '/payments/aps.jpg', '/payments/aps.png', '/payments/aps.webp', '/payments/aps.svg']
};

interface PaymentBrandLogoProps {
  brand: PaymentBrandId;
  alt: string;
  className?: string;
}

/**
 * Renders a payment-brand mark from frontend/public/payments.
 * Tries svg/png/webp/jpg; if none load, shows the alt text.
 */
export function PaymentBrandLogo({ brand, alt, className }: PaymentBrandLogoProps) {
  const sources = BRAND_SOURCES[brand];
  const [sourceIndex, setSourceIndex] = useState(0);

  if (sourceIndex >= sources.length) {
    return <span className="font-semibold leading-none">{alt}</span>;
  }

  return (
    <img
      src={sources[sourceIndex]}
      alt={alt}
      className={className}
      onError={() => setSourceIndex((i) => i + 1)}
    />
  );
}
