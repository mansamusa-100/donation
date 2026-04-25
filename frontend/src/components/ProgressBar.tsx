import { motion } from 'framer-motion';
interface ProgressBarProps {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}
export function ProgressBar({
  progress,
  size = 'md',
  showLabel = false
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4'
  };
  return (
    <div className="w-full">
      <div
        className={`w-full bg-surface-200 rounded-full overflow-hidden ${heights[size]}`}>
        
        <motion.div
          initial={{
            width: 0
          }}
          whileInView={{
            width: `${clampedProgress}%`
          }}
          viewport={{
            once: true
          }}
          transition={{
            duration: 1,
            ease: 'easeOut'
          }}
          className="h-full bg-brand-600 rounded-full" />
        
      </div>
      {showLabel &&
      <div className="mt-1 text-right text-xs font-medium text-surface-500">
          {Math.round(clampedProgress)}%
        </div>
      }
    </div>);

}
