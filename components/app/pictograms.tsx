import type { SVGProps } from "react"

/**
 * Venue pictograms, drawn on a 24-unit grid in the Munich 1972 manner:
 * strokes run at 0, 45 or 90 degrees, round caps, a solid round head.
 */
type PictogramProps = SVGProps<SVGSVGElement>

function Frame({ children, ...props }: PictogramProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

/** Weightlifter, bar locked out overhead. */
export function LifterPictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <path d="M3.5 4.5H20.5" />
      <rect x="3.6" y="2.1" width="2.6" height="4.8" rx="0.9" fill="currentColor" stroke="none" />
      <rect x="17.8" y="2.1" width="2.6" height="4.8" rx="0.9" fill="currentColor" stroke="none" />
      <path d="M9 4.5V10.5H15V4.5" />
      <circle cx="12" cy="7.5" r="1.75" fill="currentColor" stroke="none" />
      <path d="M12 10.5V15" />
      <path d="M8 21.5V19L12 15L16 19V21.5" />
    </Frame>
  )
}

/** Clipboard with a 45-degree tick. */
export function CheckinPictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <path d="M8 4.5H5.5V21H18.5V4.5H16" />
      <rect x="8.75" y="2.5" width="6.5" height="3.75" rx="1" fill="currentColor" stroke="none" />
      <path d="M8.5 13.5L11 16L15.5 11.5" />
    </Frame>
  )
}

/** House with a door. */
export function HomePictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <path d="M4 11.5L12 3.5L20 11.5" />
      <path d="M6.5 9.5V20.5H17.5V9.5" />
      <path d="M10.5 20.5V15.5H13.5V20.5" />
    </Frame>
  )
}

/** Standing figure, arms out at 45 degrees. */
export function BodyPictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <circle cx="12" cy="4.5" r="2" fill="currentColor" stroke="none" />
      <path d="M12 8.25V14.5" />
      <path d="M7.75 12.5L12 8.25L16.25 12.5" />
      <path d="M8.5 21.5V18L12 14.5L15.5 18V21.5" />
    </Frame>
  )
}

/** The grid itself: four cells. */
export function MorePictogram(props: PictogramProps) {
  return (
    <Frame {...props}>
      <rect x="4.25" y="4.25" width="6" height="6" rx="1.25" />
      <rect x="13.75" y="4.25" width="6" height="6" rx="1.25" />
      <rect x="4.25" y="13.75" width="6" height="6" rx="1.25" />
      <rect x="13.75" y="13.75" width="6" height="6" rx="1.25" />
    </Frame>
  )
}
