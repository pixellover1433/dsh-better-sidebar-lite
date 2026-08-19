/**
 * Tiny inline-SVG icon set (ADR-003): self-contained, theme-aware via
 * currentColor; no icon library.
 */
import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 16, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  }
}

export function FolderIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.6 1.6h5.2a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-7z" /></svg>
}

export function FileIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M3.5 1.5h5.6l3.4 3.4v9.6h-9z" /><path d="M9 1.5v3.4h3.4" /></svg>
}

export function SymlinkIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M3 3h5.5l2 2.5" /><path d="M8.5 5.5L13 12" /><path d="M9 12h4" /></svg>
}

export function GitBranchIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="4.5" cy="4" r="1.6" /><circle cx="4.5" cy="12" r="1.6" /><circle cx="11.5" cy="6" r="1.6" /><path d="M4.5 5.6v4.8" /><path d="M6.1 6.3c2.6-.4 5.4.5 5.4 2.6" /></svg>
}

export function ChevronRightIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M6 3.5L10.5 8L6 12.5" /></svg>
}

export function ChevronDownIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M3.5 6L8 10.5L12.5 6" /></svg>
}

export function RefreshIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 1.8v2.6h-2.6" /></svg>
}

export function SkillsIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M8 1.5l1.6 4.8 4.9 1.7-4.9 1.7L8 14.5" /><path d="M4 9.5l.8 2.2 2.2.8" /></svg>
}

export function CollapseIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M11 3.5V12.5" /><path d="M5 4l4 4l-4 4" /></svg>
}

export function ExpandIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M5 3.5v9" /><path d="M11 4l-4 4l4 4" /></svg>
}

export function CloseIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M4 4l8 8" /><path d="M12 4l-8 8" /></svg>
}