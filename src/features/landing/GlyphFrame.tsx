import { Fragment, type HTMLAttributes, type ReactNode } from 'react'

// A frame drawn with box-drawing glyphs, the way a TUI draws a window:
//
//   ┌──────┐
//   │ body │
//   ├──────┤   (between sections)
//   │ body │
//   └──────┘
//
// Edges are long glyph runs clipped to their grid track, so the frame follows
// whatever size the content and the layout give it.

const H = '─'.repeat(400)
const V = '│\n'.repeat(200)

interface GlyphFrameProps extends HTMLAttributes<HTMLElement> {
  sections: ReactNode[]
  /** Index of the section that takes the remaining height, if any. */
  grow?: number
  as?: 'div' | 'section'
}

export function GlyphFrame({ sections, grow, as: Tag = 'div', className, style, ...rest }: GlyphFrameProps) {
  const rows = ['auto']
  sections.forEach((_, i) => {
    if (i > 0) rows.push('auto')
    rows.push(i === grow ? 'minmax(0, 1fr)' : 'auto')
  })
  rows.push('auto')

  return (
    <Tag
      {...rest}
      className={`kl-frame${className ? ` ${className}` : ''}`}
      style={{ ...style, gridTemplateRows: rows.join(' ') }}
    >
      <Edge corner="┌" />
      <span className="kl-frame-h" aria-hidden="true">
        {H}
      </span>
      <Edge corner="┐" />
      {sections.map((section, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              <Edge corner="├" />
              <span className="kl-frame-h" aria-hidden="true">
                {H}
              </span>
              <Edge corner="┤" />
            </>
          )}
          <span className="kl-frame-v" aria-hidden="true">
            {V}
          </span>
          <div className="kl-frame-body">{section}</div>
          <span className="kl-frame-v" aria-hidden="true">
            {V}
          </span>
        </Fragment>
      ))}
      <Edge corner="└" />
      <span className="kl-frame-h" aria-hidden="true">
        {H}
      </span>
      <Edge corner="┘" />
    </Tag>
  )
}

function Edge({ corner }: { corner: string }) {
  return (
    <span className="kl-frame-c" aria-hidden="true">
      {corner}
    </span>
  )
}
