import { ridgeLayers } from './inkWash'

// The contained atmosphere layer. Sits inside ONE panel — never behind the
// page — and stays under ~12% opacity, which is the line between texture and
// something the text has to compete with.
//
// The wash is cream on whatever ground it is placed over, so it is made of a
// colour the palette already contains and cannot clash with the accent.
export default function InkWash({ seed = 'a', opacity = 0.09, tint = '#F6F1E7' }) {
  const layers = ridgeLayers(seed, 3)
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', opacity,
      }}
    >
      {layers.map((layer, i) => (
        <path key={i} d={layer.d} fill={tint} opacity={layer.opacity} />
      ))}
    </svg>
  )
}
