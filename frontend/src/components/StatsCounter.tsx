import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
interface StatsCounterProps {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
}
export function StatsCounter({
  value,
  label,
  prefix = '',
  suffix = ''
}: StatsCounterProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, {
    once: true,
    margin: '-50px'
  });
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    if (isInView) {
      let start = 0;
      const duration = 2000; // 2 seconds
      const increment = value / (duration / 16); // 60fps
      const timer = setInterval(() => {
        start += increment;
        if (start >= value) {
          setDisplayValue(value);
          clearInterval(timer);
        } else {
          setDisplayValue(Math.floor(start));
        }
      }, 16);
      return () => clearInterval(timer);
    }
  }, [isInView, value]);
  const formattedValue =
  displayValue >= 1000000 ?
  (displayValue / 1000000).toFixed(1) + 'M' :
  displayValue.toLocaleString();
  return (
    <div
      ref={ref}
      className="flex flex-col items-center text-center p-6 bg-white rounded-2xl shadow-warm">
      
      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={
        isInView ?
        {
          opacity: 1,
          y: 0
        } :
        {}
        }
        transition={{
          duration: 0.5
        }}
        className="text-3xl md:text-4xl font-display font-bold text-brand-600 mb-2">
        
        {prefix}
        {formattedValue}
        {suffix}
      </motion.div>
      <div className="text-surface-500 font-medium">{label}</div>
    </div>);

}
