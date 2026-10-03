import type { SVGProps } from "react"

/**
 * Venue pictograms in the Munich 1972 manner, on a 24-unit grid: solid bars of
 * uniform thickness with square-cut ends, joints only at 45 or 90 degrees, a
 * round head floating clear of the shoulders. Everything is filled, so the
 * venue marks read as signage next to the outline utility icons.
 */
type PictogramProps = SVGProps<SVGSVGElement>

function Frame({ children, ...props }: PictogramProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

/** A limb or torso: a straight-cut bar following the path. */
function Bar({ d, w }: { d: string; w: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="butt"
      strokeLinejoin="miter"
    />
  )
}

/** Weightlifter, bar locked out overhead. */
export function LifterPictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <Bar d="M2.4 2.8H21.6" w={1.6} />
      <rect x="2" y="0.6" width="2.8" height="4.4" rx="0.5" />
      <rect x="19.2" y="0.6" width="2.8" height="4.4" rx="0.5" />
      <Bar d="M7.5 2.8V10H16.5V2.8" w={2.6} />
      <circle cx="12" cy="6.2" r="2" />
      <Bar d="M12 10V15" w={4.6} />
      <Bar d="M7.4 22.5V18.6L12 14L16.6 18.6V22.5" w={2.8} />
    </Frame>
  )
}

/** Clipboard with a 45-degree tick cut through it. */
export function CheckinPictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <path
        fillRule="evenodd"
        d="M6 4.5H8.5V2.5A1 1 0 0 1 9.5 1.5H14.5A1 1 0 0 1 15.5 2.5V4.5H18A1.5 1.5 0 0 1 19.5 6V20.5A1.5 1.5 0 0 1 18 22H6A1.5 1.5 0 0 1 4.5 20.5V6A1.5 1.5 0 0 1 6 4.5Z M8.92 12.08L11 14.16L15.58 9.58L17.42 11.42L11 17.84L7.08 13.92Z"
      />
    </Frame>
  )
}

/** House under a 45-degree roof, door cut out. */
export function HomePictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <path d="M12 2.5L21.5 12H19V21.5H14V15H10V21.5H5V12H2.5Z" />
    </Frame>
  )
}

/** Standing figure, arms down and out at 45 degrees. */
export function BodyPictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <circle cx="12" cy="3.8" r="2.3" />
      <Bar d="M5.6 13.4L10.4 8.6H13.6L18.4 13.4" w={2.8} />
      <Bar d="M12 8.6V14.6" w={4.4} />
      <Bar d="M9.4 22.5V18L12 15.4L14.6 18V22.5" w={2.6} />
    </Frame>
  )
}

/** The grid itself: four solid cells. */
export function MorePictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1" />
    </Frame>
  )
}
