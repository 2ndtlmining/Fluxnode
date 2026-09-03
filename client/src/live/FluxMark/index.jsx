/*
 * The real Flux brand mark — the same circle + four angular facet shapes
 * used in public/app-logo.svg — lifted out of the wordmark lockup so it can
 * stand alone at icon size. Replaces the generic lucide <Box> that used to
 * sit in the chain rail's block icon slot.
 *
 * The four facets keep their own individual class (flux-mark-facet--1..4)
 * so ChainRail's CSS can stagger them in on entry, each "snapping" into the
 * circle rather than the whole mark just fading in as one flat unit.
 */
export function FluxMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 31 31" width="20" height="20" aria-hidden="true">
      <path
        className="flux-mark-circle"
        d="M15.46,0A15.357,15.357,0,1,1,0,15.357,15.409,15.409,0,0,1,15.46,0Z"
        fill="#2b61d1"
      />
      <g transform="translate(7.011 5.615)">
        <path
          className="flux-mark-facet flux-mark-facet--1"
          d="M89.574,168.764l-1.761,1.017L84.03,167.6l1.718-.992.043-.025.066.038Z"
          transform="translate(-79.293 -150.105)"
          fill="#fff"
        />
        <path
          className="flux-mark-facet flux-mark-facet--2"
          d="M63.541,40.979v2.047l-3.724-2.15-1.01-.583-1.01.583L53.064,43.61l-1.01.583V45.4l-1.821-1.051-1.01-.583-1.01.583-1.713.988V40.979l8.52-4.919Z"
          transform="translate(-46.5 -36.06)"
          fill="#fff"
        />
        <path
          className="flux-mark-facet flux-mark-facet--3"
          d="M115.967,90.8V96.27L111.234,99l-.006,0L106.5,96.27V90.8l4.734-2.734Z"
          transform="translate(-98.926 -81.505)"
          fill="#fff"
        />
        <path
          className="flux-mark-facet flux-mark-facet--4"
          d="M51.945,117.141v3.143l-2.723,1.573L46.5,120.285v-3.143l2.723-1.572Z"
          transform="translate(-46.5 -105.534)"
          fill="#fff"
        />
      </g>
    </svg>
  );
}
