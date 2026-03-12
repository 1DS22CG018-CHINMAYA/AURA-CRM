import { motion } from 'framer-motion'
import { cn } from '../lib/utils'

/**
 * Animated shimmer skeleton line.
 * Control size via className (e.g. "h-4 w-full") and style for inline widths.
 */
export function SkeletonLine({ className, style }) {
    return (
        <div
            className={cn('rounded-full relative overflow-hidden', className)}
            style={{ background: 'rgba(255,255,255,0.05)', ...style }}
        >
            <motion.div
                className="absolute inset-0"
                style={{
                    background:
                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%)',
                }}
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
            />
        </div>
    )
}

/** Block of stacked lines — good for paragraphs / card bodies */
export function CardSkeleton({ lines = 4 }) {
    const widths = ['100%', '91%', '83%', '58%', '76%']
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonLine
                    key={i}
                    className="h-4"
                    style={{ width: widths[i % widths.length] }}
                />
            ))}
        </div>
    )
}

/** Single list-item skeleton (avatar + two text lines + badge) */
export function ListItemSkeleton() {
    return (
        <div className="flex items-center gap-3">
            <SkeletonLine className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <SkeletonLine className="h-3" style={{ width: '68%' }} />
                <SkeletonLine className="h-2" style={{ width: '44%' }} />
            </div>
            <SkeletonLine className="h-5 w-8 rounded-full" />
        </div>
    )
}

/** Task skeleton — checkbox square + text line */
export function TaskSkeleton() {
    return (
        <div className="flex items-center gap-3">
            <SkeletonLine className="h-4 w-4 rounded flex-shrink-0" style={{ borderRadius: '4px' }} />
            <SkeletonLine className="h-3 flex-1" style={{ maxWidth: '260px' }} />
        </div>
    )
}
